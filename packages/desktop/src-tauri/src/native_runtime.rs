// NativeRuntime — Direct llama.cpp integration via llama-cpp-2 Rust bindings.
//
// LOCKED DECISION: Uses `llama-cpp-2` (v0.1.x by utilityai), the actively maintained
// Rust binding for llama.cpp. The alternative `llama_cpp_rs` (mdrokz) hasn't been
// updated in 2+ years.
//
// Architecture:
// - Only one reasoning model loaded at a time (Arc<Mutex<>> guarded)
// - Embedding model stays resident separately (small, ~275MB)
// - GPU backend auto-selected: CUDA (Windows/Linux) > Metal (macOS) > CPU fallback
// - Methods are synchronous (CPU-bound llama.cpp calls) — callers use the async
//   Mutex wrapper and tokio tasks for concurrency.
//
// FALLBACK STRATEGY: If llama-cpp-2 compilation fails on Windows 11, bundle
// `llama-server` as a managed subprocess instead. The NativeProvider TypeScript
// interface stays the same regardless of backend.

use llama_cpp_2::{
    context::params::LlamaContextParams,
    llama_backend::LlamaBackend,
    llama_batch::LlamaBatch,
    model::{params::LlamaModelParams, AddBos, LlamaModel},
    sampling::LlamaSampler,
};
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateRequest {
    pub model_path: String,
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub stop: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateResponse {
    pub text: String,
    pub tokens_generated: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmbedRequest {
    pub model_path: String,
    pub input: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmbedResponse {
    pub embeddings: Vec<Vec<f32>>,
    pub dimensions: u32,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RuntimeStatus {
    Uninitialized,
    Loading,
    Ready,
    Error(String),
}

// ─── NativeRuntime ───────────────────────────────────────────────────────────

/// NativeRuntime manages llama.cpp model instances for local inference.
///
/// Thread-safe via Arc<Mutex<>>. Only one reasoning model loaded at a time.
/// Embedding model can be loaded concurrently (separate context).
///
/// All inference methods are synchronous (CPU-bound llama.cpp FFI calls).
/// The caller wraps access in tokio::sync::Mutex for async compatibility.
pub struct NativeRuntime {
    status: RuntimeStatus,
    backend: Option<LlamaBackend>,
    reasoning_model: Option<LlamaModel>,
    reasoning_model_path: Option<PathBuf>,
    embedding_model: Option<LlamaModel>,
    embedding_model_path: Option<PathBuf>,
}

impl NativeRuntime {
    pub fn new() -> Self {
        let backend = match LlamaBackend::init() {
            Ok(mut b) => {
                b.void_logs();
                Some(b)
            }
            Err(e) => {
                eprintln!(
                    "[NativeRuntime] Failed to initialize llama.cpp backend: {}",
                    e
                );
                None
            }
        };
        NativeRuntime {
            status: RuntimeStatus::Uninitialized,
            backend,
            reasoning_model: None,
            reasoning_model_path: None,
            embedding_model: None,
            embedding_model_path: None,
        }
    }

    /// Load a reasoning model from a GGUF file.
    /// Blocking — model loading reads the full file from disk.
    pub fn load_reasoning_model(&mut self, model_path: PathBuf) -> Result<(), String> {
        if !model_path.exists() {
            return Err(format!("Model file not found: {:?}", model_path));
        }

        let backend = self
            .backend
            .as_ref()
            .ok_or("llama.cpp backend not initialized")?;

        self.status = RuntimeStatus::Loading;

        // Offload all layers to GPU if available; CPU fallback is automatic
        let model_params = LlamaModelParams::default().with_n_gpu_layers(1000);

        match LlamaModel::load_from_file(backend, &model_path, &model_params) {
            Ok(model) => {
                eprintln!(
                    "[NativeRuntime] Reasoning model loaded: {:?} ({} params, {} layers)",
                    model_path,
                    model.n_params(),
                    model.n_layer()
                );
                self.reasoning_model = Some(model);
                self.reasoning_model_path = Some(model_path);
                self.status = RuntimeStatus::Ready;
                Ok(())
            }
            Err(e) => {
                let err_msg = format!("Failed to load reasoning model: {}", e);
                self.status = RuntimeStatus::Error(err_msg.clone());
                Err(err_msg)
            }
        }
    }

    /// Load an embedding model from a GGUF file.
    /// Blocking — model loading reads the full file from disk.
    pub fn load_embedding_model(&mut self, model_path: PathBuf) -> Result<(), String> {
        if !model_path.exists() {
            return Err(format!(
                "Embedding model file not found: {:?}",
                model_path
            ));
        }

        let backend = self
            .backend
            .as_ref()
            .ok_or("llama.cpp backend not initialized")?;

        let model_params = LlamaModelParams::default().with_n_gpu_layers(1000);

        match LlamaModel::load_from_file(backend, &model_path, &model_params) {
            Ok(model) => {
                eprintln!(
                    "[NativeRuntime] Embedding model loaded: {:?} (dim={})",
                    model_path,
                    model.n_embd()
                );
                self.embedding_model = Some(model);
                self.embedding_model_path = Some(model_path);
                Ok(())
            }
            Err(e) => Err(format!("Failed to load embedding model: {}", e)),
        }
    }

    /// Generate text from a prompt using the loaded reasoning model.
    /// Blocking — runs the full inference loop synchronously.
    pub fn generate(&self, request: GenerateRequest) -> Result<GenerateResponse, String> {
        if !matches!(self.status, RuntimeStatus::Ready) {
            return Err("Runtime not ready — no model loaded".to_string());
        }

        let backend = self
            .backend
            .as_ref()
            .ok_or("llama.cpp backend not initialized")?;
        let model = self
            .reasoning_model
            .as_ref()
            .ok_or("No reasoning model loaded")?;

        let start = std::time::Instant::now();
        let max_tokens = request.max_tokens.unwrap_or(512);
        let temperature = request.temperature.unwrap_or(0.7);

        // Build prompt with optional system prompt
        let full_prompt = match &request.system_prompt {
            Some(sys) => format!(
                "<|system|>\n{}\n<|end|>\n<|user|>\n{}\n<|end|>\n<|assistant|>\n",
                sys, request.prompt
            ),
            None => request.prompt.clone(),
        };

        // Create context for this request
        let ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(4096));
        let mut ctx = model
            .new_context(backend, ctx_params)
            .map_err(|e| format!("Failed to create context: {}", e))?;

        // Tokenize
        let tokens = model
            .str_to_token(&full_prompt, AddBos::Always)
            .map_err(|e| format!("Tokenization failed: {}", e))?;

        if tokens.is_empty() {
            return Err("Empty prompt after tokenization".to_string());
        }

        // Create batch and add prompt tokens (only compute logits for last token)
        let mut batch = LlamaBatch::new(tokens.len().max(512), 1);
        let last_idx = (tokens.len() - 1) as i32;
        for (i, token) in (0i32..).zip(tokens.iter()) {
            batch
                .add(*token, i, &[0], i == last_idx)
                .map_err(|e| format!("Batch add failed: {}", e))?;
        }

        // Decode prompt (prefill)
        ctx.decode(&mut batch)
            .map_err(|e| format!("Prompt decode failed: {}", e))?;

        // Create sampler chain: top-p + min-p + temperature + random sampling
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::top_p(0.95, 1),
            LlamaSampler::min_p(0.05, 1),
            LlamaSampler::temp(temperature),
            LlamaSampler::dist(42),
        ]);

        // Generation loop
        let mut output = String::new();
        let mut decoder = encoding_rs::UTF_8.new_decoder();
        let mut n_cur = batch.n_tokens();
        let mut tokens_generated = 0u32;

        for _ in 0..max_tokens {
            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);

            // End-of-generation check
            if model.is_eog_token(token) {
                break;
            }

            // Decode token to text
            let piece = model
                .token_to_piece(token, &mut decoder, true, None)
                .map_err(|e| format!("Token decode failed: {}", e))?;
            output.push_str(&piece);
            tokens_generated += 1;

            // Check stop sequences
            if let Some(ref stops) = request.stop {
                if let Some(stop) = stops.iter().find(|s| output.ends_with(s.as_str())) {
                    output.truncate(output.len() - stop.len());
                    break;
                }
            }

            // Prepare next batch with just the new token
            batch.clear();
            batch
                .add(token, n_cur, &[0], true)
                .map_err(|e| format!("Batch add failed: {}", e))?;
            ctx.decode(&mut batch)
                .map_err(|e| format!("Decode failed: {}", e))?;
            n_cur += 1;
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(GenerateResponse {
            text: output,
            tokens_generated,
            duration_ms,
        })
    }

    /// Generate embeddings for a batch of texts using the loaded embedding model.
    /// Blocking — runs forward pass for each input text synchronously.
    pub fn embed(&self, request: EmbedRequest) -> Result<EmbedResponse, String> {
        let model = self
            .embedding_model
            .as_ref()
            .ok_or("No embedding model loaded")?;
        let backend = self
            .backend
            .as_ref()
            .ok_or("llama.cpp backend not initialized")?;

        let start = std::time::Instant::now();
        let n_embd = model.n_embd() as u32;
        let mut all_embeddings = Vec::with_capacity(request.input.len());

        for text in &request.input {
            // Create embedding context per input (with mean pooling for sentence embeddings)
            let ctx_params = LlamaContextParams::default()
                .with_embeddings(true)
                .with_n_ctx(NonZeroU32::new(2048));
            let mut ctx = model
                .new_context(backend, ctx_params)
                .map_err(|e| format!("Failed to create embedding context: {}", e))?;

            let tokens = model
                .str_to_token(text, AddBos::Always)
                .map_err(|e| format!("Tokenization failed: {}", e))?;

            if tokens.is_empty() {
                all_embeddings.push(vec![0.0f32; n_embd as usize]);
                continue;
            }

            let mut batch = LlamaBatch::new(tokens.len(), 1);
            batch
                .add_sequence(&tokens, 0, false)
                .map_err(|e| format!("Batch add failed: {}", e))?;

            ctx.clear_kv_cache();
            ctx.decode(&mut batch)
                .map_err(|e| format!("Embedding decode failed: {}", e))?;

            let embedding = ctx
                .embeddings_seq_ith(0)
                .map_err(|e| format!("Failed to get embeddings: {}", e))?;

            // L2 normalize the embedding vector
            let magnitude = embedding
                .iter()
                .fold(0.0f32, |acc, &v| v.mul_add(v, acc))
                .sqrt();
            let normalized: Vec<f32> = if magnitude > 0.0 {
                embedding.iter().map(|&v| v / magnitude).collect()
            } else {
                embedding.to_vec()
            };

            all_embeddings.push(normalized);
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(EmbedResponse {
            embeddings: all_embeddings,
            dimensions: n_embd,
            duration_ms,
        })
    }

    /// Unload the reasoning model to free memory.
    pub fn unload_reasoning_model(&mut self) {
        self.reasoning_model = None;
        self.reasoning_model_path = None;
        if self.embedding_model.is_some() {
            self.status = RuntimeStatus::Ready;
        } else {
            self.status = RuntimeStatus::Uninitialized;
        }
    }

    /// Unload the embedding model to free memory.
    pub fn unload_embedding_model(&mut self) {
        self.embedding_model = None;
        self.embedding_model_path = None;
    }

    /// Get the current runtime status.
    pub fn status(&self) -> &RuntimeStatus {
        &self.status
    }

    /// Check if a reasoning model is loaded.
    pub fn has_reasoning_model(&self) -> bool {
        self.reasoning_model.is_some()
    }

    /// Check if an embedding model is loaded.
    pub fn has_embedding_model(&self) -> bool {
        self.embedding_model.is_some()
    }

    /// Get reasoning model path if loaded.
    pub fn reasoning_model_path(&self) -> Option<&PathBuf> {
        self.reasoning_model_path.as_ref()
    }

    /// Get embedding model path if loaded.
    pub fn embedding_model_path(&self) -> Option<&PathBuf> {
        self.embedding_model_path.as_ref()
    }
}

/// Thread-safe wrapper for NativeRuntime.
pub type SharedNativeRuntime = Arc<Mutex<NativeRuntime>>;

/// Create a new shared NativeRuntime instance.
pub fn create_runtime() -> SharedNativeRuntime {
    Arc::new(Mutex::new(NativeRuntime::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_new_runtime_is_uninitialized() {
        let runtime = NativeRuntime::new();
        assert!(matches!(runtime.status(), RuntimeStatus::Uninitialized));
        assert!(!runtime.has_reasoning_model());
        assert!(!runtime.has_embedding_model());
    }

    #[tokio::test]
    async fn test_load_nonexistent_model_fails() {
        let mut runtime = NativeRuntime::new();
        let result = runtime.load_reasoning_model(PathBuf::from("/nonexistent/model.gguf"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_generate_without_model_fails() {
        let runtime = NativeRuntime::new();
        let result = runtime.generate(GenerateRequest {
            model_path: String::new(),
            prompt: "test".to_string(),
            system_prompt: None,
            max_tokens: None,
            temperature: None,
            stop: None,
        });
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not ready"));
    }

    #[tokio::test]
    async fn test_embed_without_model_fails() {
        let runtime = NativeRuntime::new();
        let result = runtime.embed(EmbedRequest {
            model_path: String::new(),
            input: vec!["test".to_string()],
        });
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_create_shared_runtime() {
        let shared = create_runtime();
        let runtime = shared.lock().await;
        assert!(matches!(runtime.status(), RuntimeStatus::Uninitialized));
    }
}

// NativeRuntime — Direct llama.cpp integration via BitNet.cpp FFI bindings.
//
// LOCKED DECISION (2026-03-13): Uses `bitnet-sys` crate which compiles BitNet.cpp
// (Microsoft's llama.cpp fork with 1-bit kernel support) from source via CMake.
// BitNet.cpp is a superset of llama.cpp — same API plus optimized TL1/TL2/i2_s
// kernels. Standard GGUF models (Q4_K_M, Q8_0, etc.) load normally. BitNet GGUFs
// get the optimized 1-bit kernels automatically.
//
// Replaces the previous `llama-cpp-2` crate (TODO-05 Step 1).
//
// Architecture:
// - Only one reasoning model loaded at a time (Arc<Mutex<>> guarded)
// - Embedding model stays resident separately (small, ~275MB)
// - GPU backend auto-selected: CUDA (Windows/Linux) > Metal (macOS) > CPU fallback
// - Methods are synchronous (CPU-bound llama.cpp FFI calls) — callers use the async
//   Mutex wrapper and tokio tasks for concurrency.

use bitnet_sys::{
    AddBos, LlamaBackend, LlamaBatch, LlamaContextParams, LlamaModel,
    LlamaModelParams, LlamaSampler,
};
use serde::{Deserialize, Serialize};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateRequest {
    #[serde(default)]
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
    #[serde(default)]
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

/// NativeRuntime manages BitNet.cpp / llama.cpp model instances for local inference.
///
/// Thread-safe via Arc<Mutex<>>. Only one reasoning model loaded at a time.
/// Embedding model can be loaded concurrently (separate context).
///
/// All inference methods are synchronous (CPU-bound FFI calls).
/// The caller wraps access in tokio::sync::Mutex for async compatibility.
pub struct NativeRuntime {
    status: RuntimeStatus,
    backend: Option<LlamaBackend>,
    reasoning_model: Option<LlamaModel>,
    reasoning_model_path: Option<PathBuf>,
    embedding_model: Option<LlamaModel>,
    embedding_model_path: Option<PathBuf>,
}

#[allow(dead_code)] // Public API — callers wired in Step 2 (BitNetProvider)
impl NativeRuntime {
    pub fn new() -> Self {
        let backend = match LlamaBackend::init() {
            Ok(mut b) => {
                b.void_logs();
                Some(b)
            }
            Err(e) => {
                eprintln!(
                    "[NativeRuntime] Failed to initialize BitNet.cpp backend: {}",
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
    /// Works with both standard GGUF (Q4_K_M, Q8_0) and BitNet i2_s GGUFs.
    /// Blocking — model loading reads the full file from disk.
    pub fn load_reasoning_model(&mut self, model_path: PathBuf) -> Result<(), String> {
        if !model_path.exists() {
            return Err(format!("Model file not found: {:?}", model_path));
        }

        let backend = self
            .backend
            .as_ref()
            .ok_or("BitNet.cpp backend not initialized")?;

        self.status = RuntimeStatus::Loading;

        // CPU-only inference (CUDA/Vulkan disabled in BitNet build for portability).
        // n_gpu_layers=0 keeps everything on CPU — avoids crashes from missing GPU backend.
        let model_params = LlamaModelParams::default().with_n_gpu_layers(0);

        match LlamaModel::load_from_file(backend, &model_path, &model_params) {
            Ok(model) => {
                eprintln!(
                    "[NativeRuntime] Reasoning model loaded: {:?} ({} params, embd={})",
                    model_path,
                    model.n_params(),
                    model.n_embd()
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
            .ok_or("BitNet.cpp backend not initialized")?;

        let model_params = LlamaModelParams::default().with_n_gpu_layers(0);

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

    // File-based logging — eprintln goes nowhere on Windows GUI apps
    fn log(msg: &str) {
        use std::io::Write;
        let log_path = if cfg!(target_os = "windows") {
            let appdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
            std::path::PathBuf::from(appdata)
                .join("Semblance")
                .join("native_runtime.log")
        } else {
            std::path::PathBuf::from("/tmp/semblance_native_runtime.log")
        };
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(f, "[NativeRuntime] {}", msg);
        }
    }

    /// Generate text from a prompt using the loaded reasoning model.
    /// Blocking — runs the full inference loop synchronously.
    pub fn generate(&self, request: GenerateRequest) -> Result<GenerateResponse, String> {
        Self::log("generate() entered");

        if !matches!(self.status, RuntimeStatus::Ready) {
            return Err("Runtime not ready — no model loaded".to_string());
        }

        let backend = self
            .backend
            .as_ref()
            .ok_or("BitNet.cpp backend not initialized")?;
        let model = self
            .reasoning_model
            .as_ref()
            .ok_or("No reasoning model loaded")?;

        let start = std::time::Instant::now();
        let max_tokens = request.max_tokens.unwrap_or(512);
        let temperature = request.temperature.unwrap_or(0.7);

        let full_prompt = match &request.system_prompt {
            Some(sys) if !sys.is_empty() => format!(
                "<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n",
                sys, request.prompt
            ),
            _ => format!(
                "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n",
                request.prompt
            ),
        };

        Self::log(&format!(
            "generate: prompt_len={} chars, max_tokens={}, temp={}",
            full_prompt.len(),
            max_tokens,
            temperature
        ));

        // Use 2048 context for initial decode — 8192 was causing OOM crashes on 10B models.
        // The KV cache for 10B at 8192 ctx requires ~4GB+ RAM on top of model weights.
        // 2048 is sufficient for most conversational turns and keeps memory manageable.
        Self::log("generate: creating context with n_ctx=2048...");
        let ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(2048));
        let mut ctx = model
            .new_context(backend, ctx_params)
            .map_err(|e| format!("Failed to create context: {}", e))?;
        Self::log("generate: context created OK");

        Self::log("generate: tokenizing...");
        let tokens = model
            .str_to_token(&full_prompt, AddBos::Always)
            .map_err(|e| format!("Tokenization failed: {}", e))?;

        Self::log(&format!("generate: tokenized {} tokens", tokens.len()));

        if tokens.is_empty() {
            return Err("Empty prompt after tokenization".to_string());
        }

        // Safety: if prompt exceeds context window, truncate to leave room for response.
        let n_ctx: usize = 2048;
        let max_prompt_tokens = n_ctx.saturating_sub(max_tokens as usize);
        let tokens = if tokens.len() > max_prompt_tokens {
            Self::log(&format!(
                "generate: TRUNCATING {} tokens -> {} to fit context",
                tokens.len(),
                max_prompt_tokens
            ));
            tokens[..max_prompt_tokens].to_vec()
        } else {
            Self::log(&format!(
                "generate: tokens fit ({} <= {})",
                tokens.len(),
                max_prompt_tokens
            ));
            tokens
        };

        // Chunked prefill: decode prompt in small batches.
        // i2_s (BitNet) models can segfault on large batch decode calls.
        // Use small chunks (16 tokens) matching the MAD kernel's 16-row assumption.
        let chunk_size: usize = 16;
        let total_prompt_tokens = tokens.len();
        Self::log(&format!(
            "generate: chunked prefill, {} tokens in chunks of {}",
            total_prompt_tokens, chunk_size
        ));

        let mut pos: i32 = 0;
        for (chunk_idx, chunk) in tokens.chunks(chunk_size).enumerate() {
            let is_last_chunk = (chunk_idx + 1) * chunk_size >= total_prompt_tokens;
            let mut batch = LlamaBatch::new(chunk.len().max(512), 1);

            for (i, token) in chunk.iter().enumerate() {
                let is_last_token = is_last_chunk && i == chunk.len() - 1;
                batch
                    .add(*token, pos, &[0], is_last_token)
                    .map_err(|e| format!("Batch add failed: {}", e))?;
                pos += 1;
            }

            Self::log(&format!(
                "generate: decoding chunk {} ({} tokens, pos={}, batch_n_tokens={})",
                chunk_idx,
                chunk.len(),
                pos,
                batch.inner.n_tokens
            ));
            // Flush log before decode — if we crash here, at least we'll see which chunk
            Self::log("generate: calling ctx.decode()...");
            ctx.decode(&mut batch)
                .map_err(|e| format!("Prompt decode chunk {} failed: {}", chunk_idx, e))?;
            Self::log(&format!("generate: chunk {} decoded OK", chunk_idx));
        }

        Self::log("generate: prefill decode OK, starting generation loop...");

        // Create sampler chain: top-p + min-p + temperature + random sampling
        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::top_p(0.95, 1),
            LlamaSampler::min_p(0.05, 1),
            LlamaSampler::temp(temperature),
            LlamaSampler::dist(42),
        ]);

        // Generation loop — accumulate raw bytes then decode to UTF-8 at the end
        let mut output_bytes: Vec<u8> = Vec::new();
        let mut n_cur = pos;
        let mut tokens_generated = 0u32;

        // Single-token batch for auto-regressive generation
        let mut gen_batch = LlamaBatch::new(1, 1);

        for _ in 0..max_tokens {
            let token = sampler.sample(&ctx, -1);
            sampler.accept(token);

            // End-of-generation check
            if model.is_eog_token(token) {
                break;
            }

            // Decode token to bytes
            let piece = model.token_to_bytes(token);
            output_bytes.extend_from_slice(&piece);
            tokens_generated += 1;

            // Check stop sequences (on the accumulated UTF-8 string so far)
            let output_so_far = String::from_utf8_lossy(&output_bytes);
            if let Some(ref stops) = request.stop {
                if let Some(stop) = stops.iter().find(|s| output_so_far.ends_with(s.as_str())) {
                    let stop_len = stop.len();
                    // Remove the stop sequence bytes from the end
                    let output_str_len = output_so_far.len();
                    output_bytes.truncate(output_str_len - stop_len);
                    break;
                }
            }

            // Prepare next batch with just the new token
            gen_batch.clear();
            gen_batch
                .add(token, n_cur, &[0], true)
                .map_err(|e| format!("Batch add failed: {}", e))?;
            ctx.decode(&mut gen_batch)
                .map_err(|e| format!("Decode failed: {}", e))?;
            n_cur += 1;
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        let output = String::from_utf8_lossy(&output_bytes).into_owned();

        Ok(GenerateResponse {
            text: output,
            tokens_generated,
            duration_ms,
        })
    }

    /// Generate embeddings for a batch of texts using the loaded embedding model.
    /// Blocking — runs forward pass for each input text synchronously.
    pub fn embed(&self, request: EmbedRequest) -> Result<EmbedResponse, String> {
        Self::log(&format!("embed() entered, {} inputs", request.input.len()));

        let model = self
            .embedding_model
            .as_ref()
            .ok_or("No embedding model loaded")?;
        let backend = self
            .backend
            .as_ref()
            .ok_or("BitNet.cpp backend not initialized")?;

        let start = std::time::Instant::now();
        let n_embd = model.n_embd() as u32;
        let mut all_embeddings = Vec::with_capacity(request.input.len());

        for (text_idx, text) in request.input.iter().enumerate() {
            Self::log(&format!(
                "embed: processing input {}/{} ({} chars)",
                text_idx + 1,
                request.input.len(),
                text.len()
            ));

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

            Self::log(&format!("embed: tokenized {} tokens", tokens.len()));

            if tokens.is_empty() {
                all_embeddings.push(vec![0.0f32; n_embd as usize]);
                continue;
            }

            // Safety: truncate tokens to fit within the embedding context window (2048).
            let embed_ctx_size: usize = 2048;
            let tokens = if tokens.len() > embed_ctx_size {
                Self::log(&format!(
                    "embed: TRUNCATING {} tokens -> {}",
                    tokens.len(),
                    embed_ctx_size
                ));
                tokens[..embed_ctx_size].to_vec()
            } else {
                tokens
            };

            // Chunked prefill: decode tokens in batches of CHUNK_SIZE
            let chunk_size: usize = 512;
            let total_tokens = tokens.len();
            Self::log(&format!(
                "embed: chunked prefill, {} tokens in chunks of {}",
                total_tokens, chunk_size
            ));

            ctx.clear_kv_cache();

            let mut pos: i32 = 0;
            for (chunk_idx, chunk) in tokens.chunks(chunk_size).enumerate() {
                let is_last_chunk = (chunk_idx + 1) * chunk_size >= total_tokens;
                let mut batch = LlamaBatch::new(chunk.len().max(512), 1);

                for (i, token) in chunk.iter().enumerate() {
                    let is_last_token = is_last_chunk && i == chunk.len() - 1;
                    batch
                        .add(*token, pos, &[0], is_last_token)
                        .map_err(|e| format!("Embed batch add failed: {}", e))?;
                    pos += 1;
                }

                Self::log(&format!(
                    "embed: decoding chunk {} ({} tokens, pos={})",
                    chunk_idx,
                    chunk.len(),
                    pos
                ));
                ctx.decode(&mut batch)
                    .map_err(|e| format!("Embed decode chunk {} failed: {}", chunk_idx, e))?;
            }

            Self::log("embed: decode OK, extracting embeddings...");

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

            Self::log(&format!(
                "embed: input {}/{} done (dim={})",
                text_idx + 1,
                request.input.len(),
                normalized.len()
            ));
            all_embeddings.push(normalized);
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        Self::log(&format!(
            "embed: all {} inputs done in {}ms",
            all_embeddings.len(),
            duration_ms
        ));

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

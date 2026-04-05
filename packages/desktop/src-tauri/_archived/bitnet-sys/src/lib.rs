// bitnet-sys — Safe Rust wrappers for BitNet.cpp (llama.cpp fork with 1-bit kernels).
//
// Provides types that mirror the llama-cpp-2 crate API surface used by native_runtime.rs:
//   LlamaBackend, LlamaModel, LlamaContext, LlamaBatch, LlamaSampler,
//   LlamaModelParams, LlamaContextParams, AddBos, LlamaToken
//
// This is a drop-in replacement: native_runtime.rs changes only its `use` imports.
//
// DESIGN DECISIONS:
//   - Manual FFI bindings (ffi.rs) instead of bindgen: zero build-time deps, explicit
//     control over which functions are bound, stable across llama.h minor changes.
//     Only the ~35 functions used by native_runtime.rs are bound.
//   - Integrated into native_runtime.rs instead of a separate bitnet_runtime.rs:
//     the one-fork approach (BitNet.cpp replaces llama-cpp-2 entirely) means there
//     is no separate "BitNet path" vs "llama.cpp path" — they are the same binary.
//     A separate file would duplicate the entire runtime for no benefit.

pub mod ffi;

use std::ffi::CString;
use std::num::NonZeroU32;
use std::os::raw::c_char;
use std::path::Path;
use std::ptr;

// Re-export the token type
pub type LlamaToken = ffi::llama_token;

// ─── AddBos ──────────────────────────────────────────────────────────────────

/// Controls whether BOS token is added during tokenization.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AddBos {
    Always,
    Never,
}

// ─── LlamaBackend ────────────────────────────────────────────────────────────

/// Global llama.cpp backend. Init once, free on drop.
pub struct LlamaBackend {
    _initialized: bool,
}

impl LlamaBackend {
    /// Initialize the llama.cpp backend. Call once at startup.
    pub fn init() -> Result<Self, String> {
        unsafe {
            ffi::llama_backend_init();
        }
        Ok(LlamaBackend {
            _initialized: true,
        })
    }

    /// Suppress all log output from llama.cpp.
    pub fn void_logs(&mut self) {
        unsafe {
            ffi::llama_log_set(Some(null_log_callback), ptr::null_mut());
        }
    }
}

impl Drop for LlamaBackend {
    fn drop(&mut self) {
        unsafe {
            ffi::llama_backend_free();
        }
    }
}

/// No-op log callback used by void_logs().
unsafe extern "C" fn null_log_callback(
    _level: std::os::raw::c_int,
    _text: *const c_char,
    _user_data: *mut std::os::raw::c_void,
) {
    // Intentionally empty — suppresses all llama.cpp logging
}

// ─── LlamaModelParams ────────────────────────────────────────────────────────

/// Builder for model loading parameters.
pub struct LlamaModelParams {
    pub(crate) inner: ffi::llama_model_params,
}

impl Default for LlamaModelParams {
    fn default() -> Self {
        Self {
            inner: unsafe { ffi::llama_model_default_params() },
        }
    }
}

impl LlamaModelParams {
    /// Set number of GPU layers to offload. Use 1000 to offload all.
    pub fn with_n_gpu_layers(mut self, n: i32) -> Self {
        self.inner.n_gpu_layers = n;
        self
    }
}

// ─── LlamaModel ──────────────────────────────────────────────────────────────

/// Loaded GGUF model. Freed on drop.
pub struct LlamaModel {
    ptr: *mut ffi::llama_model,
}

// Safety: LlamaModel is Send because the underlying C object is thread-safe
// when accessed through proper synchronization (Arc<Mutex<>> in native_runtime.rs).
unsafe impl Send for LlamaModel {}

impl LlamaModel {
    /// Load a model from a GGUF file.
    /// The `_backend` parameter exists for API compatibility — llama.cpp uses global state.
    pub fn load_from_file(
        _backend: &LlamaBackend,
        path: &Path,
        params: &LlamaModelParams,
    ) -> Result<Self, String> {
        let path_str = path
            .to_str()
            .ok_or_else(|| format!("Invalid path: {:?}", path))?;
        let c_path =
            CString::new(path_str).map_err(|e| format!("Invalid path string: {}", e))?;

        let ptr = unsafe { ffi::llama_load_model_from_file(c_path.as_ptr(), params.inner) };

        if ptr.is_null() {
            Err(format!("Failed to load model from {:?}", path))
        } else {
            Ok(LlamaModel { ptr })
        }
    }

    /// Create a new inference context for this model.
    pub fn new_context(
        &self,
        _backend: &LlamaBackend,
        params: LlamaContextParams,
    ) -> Result<LlamaContext, String> {
        let ptr =
            unsafe { ffi::llama_new_context_with_model(self.ptr, params.inner) };

        if ptr.is_null() {
            Err("Failed to create context".to_string())
        } else {
            Ok(LlamaContext {
                ptr,
                n_embd: self.n_embd(),
            })
        }
    }

    /// Tokenize text into tokens.
    pub fn str_to_token(&self, text: &str, add_bos: AddBos) -> Result<Vec<LlamaToken>, String> {
        let c_text = CString::new(text).map_err(|e| format!("Invalid text: {}", e))?;
        let add_special = matches!(add_bos, AddBos::Always);

        // First call to get required buffer size
        let n_tokens = unsafe {
            ffi::llama_tokenize(
                self.ptr,
                c_text.as_ptr(),
                text.len() as i32,
                ptr::null_mut(),
                0,
                add_special,
                false,
            )
        };

        // n_tokens is negative, indicating the required buffer size
        let n_tokens_needed = (-n_tokens) as usize;
        let mut tokens = vec![0i32; n_tokens_needed];

        let n_written = unsafe {
            ffi::llama_tokenize(
                self.ptr,
                c_text.as_ptr(),
                text.len() as i32,
                tokens.as_mut_ptr(),
                tokens.len() as i32,
                add_special,
                false,
            )
        };

        if n_written < 0 {
            Err(format!(
                "Tokenization failed: buffer too small (needed {}, had {})",
                -n_written,
                tokens.len()
            ))
        } else {
            tokens.truncate(n_written as usize);
            Ok(tokens)
        }
    }

    /// Convert a single token to its text representation (bytes).
    /// Returns raw bytes — caller handles UTF-8 assembly for multi-byte characters.
    pub fn token_to_bytes(&self, token: LlamaToken) -> Vec<u8> {
        let mut buf = vec![0u8; 128];
        let n = unsafe {
            ffi::llama_token_to_piece(
                self.ptr,
                token,
                buf.as_mut_ptr() as *mut c_char,
                buf.len() as i32,
                0,     // lstrip
                false, // special
            )
        };

        if n < 0 {
            // Buffer too small — retry with larger buffer
            let needed = (-n) as usize;
            buf.resize(needed, 0);
            let n2 = unsafe {
                ffi::llama_token_to_piece(
                    self.ptr,
                    token,
                    buf.as_mut_ptr() as *mut c_char,
                    buf.len() as i32,
                    0,
                    false,
                )
            };
            if n2 > 0 {
                buf.truncate(n2 as usize);
            } else {
                buf.clear();
            }
        } else {
            buf.truncate(n as usize);
        }

        buf
    }

    /// Check if a token is end-of-generation.
    pub fn is_eog_token(&self, token: LlamaToken) -> bool {
        unsafe { ffi::llama_token_is_eog(self.ptr, token) }
    }

    /// Get the number of parameters in the model.
    pub fn n_params(&self) -> u64 {
        unsafe { ffi::llama_model_n_params(self.ptr) }
    }

    /// Get the embedding dimension of the model.
    pub fn n_embd(&self) -> i32 {
        unsafe { ffi::llama_n_embd(self.ptr) }
    }
}

impl Drop for LlamaModel {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                ffi::llama_free_model(self.ptr);
            }
        }
    }
}

// ─── LlamaContextParams ─────────────────────────────────────────────────────

/// Builder for inference context parameters.
pub struct LlamaContextParams {
    pub(crate) inner: ffi::llama_context_params,
}

impl Default for LlamaContextParams {
    fn default() -> Self {
        Self {
            inner: unsafe { ffi::llama_context_default_params() },
        }
    }
}

impl LlamaContextParams {
    /// Set the context window size.
    pub fn with_n_ctx(mut self, n_ctx: Option<NonZeroU32>) -> Self {
        if let Some(n) = n_ctx {
            self.inner.n_ctx = n.get();
        }
        self
    }

    /// Enable embedding mode (for sentence embeddings).
    pub fn with_embeddings(mut self, embeddings: bool) -> Self {
        self.inner.embeddings = embeddings;
        self
    }
}

// ─── LlamaContext ────────────────────────────────────────────────────────────

/// Active inference context. Freed on drop.
pub struct LlamaContext {
    ptr: *mut ffi::llama_context,
    n_embd: i32,
}

unsafe impl Send for LlamaContext {}

impl LlamaContext {
    /// Decode a batch of tokens (prefill or generation step).
    pub fn decode(&mut self, batch: &mut LlamaBatch) -> Result<(), String> {
        let result = unsafe { ffi::llama_decode(self.ptr, batch.inner) };
        if result != 0 {
            Err(format!("llama_decode failed with code {}", result))
        } else {
            Ok(())
        }
    }

    /// Get the sequence embedding for a given sequence ID.
    /// Returns a slice of f32 with length n_embd.
    pub fn embeddings_seq_ith(&self, seq_id: i32) -> Result<&[f32], String> {
        let ptr = unsafe { ffi::llama_get_embeddings_seq(self.ptr as *mut _, seq_id) };
        if ptr.is_null() {
            Err("Failed to get embeddings (null pointer)".to_string())
        } else {
            Ok(unsafe { std::slice::from_raw_parts(ptr, self.n_embd as usize) })
        }
    }

    /// Get raw mutable pointer to the underlying llama_context.
    /// Required for FFI calls like llava_eval_image_embed that need the raw C pointer.
    pub fn as_mut_ptr(&mut self) -> *mut ffi::llama_context {
        self.ptr
    }

    /// Clear the KV cache (needed between embedding batches).
    pub fn clear_kv_cache(&mut self) {
        unsafe {
            ffi::llama_kv_cache_clear(self.ptr);
        }
    }
}

impl Drop for LlamaContext {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                ffi::llama_free(self.ptr);
            }
        }
    }
}

// ─── LlamaBatch ──────────────────────────────────────────────────────────────

/// Token batch for decode operations.
pub struct LlamaBatch {
    inner: ffi::llama_batch,
    allocated: bool,
    capacity: usize,
    n_added: usize,
}

impl LlamaBatch {
    /// Create a new batch with the given token capacity and max sequences.
    pub fn new(n_tokens: usize, n_seq_max: usize) -> Self {
        let inner =
            unsafe { ffi::llama_batch_init(n_tokens as i32, 0, n_seq_max as i32) };
        LlamaBatch {
            inner,
            allocated: true,
            capacity: n_tokens,
            n_added: 0,
        }
    }

    /// Add a token to the batch.
    pub fn add(
        &mut self,
        token: LlamaToken,
        pos: i32,
        seq_ids: &[i32],
        logits: bool,
    ) -> Result<(), String> {
        if self.n_added >= self.capacity {
            return Err("Batch is full".to_string());
        }

        let idx = self.n_added;
        unsafe {
            // Set token
            *self.inner.token.add(idx) = token;

            // Set position
            *self.inner.pos.add(idx) = pos;

            // Set sequence IDs
            *self.inner.n_seq_id.add(idx) = seq_ids.len() as i32;
            let seq_id_ptr = *self.inner.seq_id.add(idx);
            for (i, &sid) in seq_ids.iter().enumerate() {
                *seq_id_ptr.add(i) = sid;
            }

            // Set logits flag
            *self.inner.logits.add(idx) = if logits { 1 } else { 0 };
        }

        self.n_added += 1;
        self.inner.n_tokens = self.n_added as i32;
        Ok(())
    }

    /// Clear the batch for reuse.
    pub fn clear(&mut self) {
        self.inner.n_tokens = 0;
        self.n_added = 0;
    }
}

impl Drop for LlamaBatch {
    fn drop(&mut self) {
        if self.allocated {
            unsafe {
                ffi::llama_batch_free(self.inner);
            }
        }
    }
}

// ─── LlamaSampler ────────────────────────────────────────────────────────────

/// Sampler or sampler chain for token selection.
pub struct LlamaSampler {
    ptr: *mut ffi::llama_sampler,
    _is_chain: bool,
}

unsafe impl Send for LlamaSampler {}

impl LlamaSampler {
    /// Create a sampler chain from a list of individual samplers.
    /// The chain takes ownership of all samplers — they are consumed.
    pub fn chain_simple<I>(samplers: I) -> Self
    where
        I: IntoIterator<Item = LlamaSampler>,
    {
        let params = unsafe { ffi::llama_sampler_chain_default_params() };
        let chain = unsafe { ffi::llama_sampler_chain_init(params) };

        for mut sampler in samplers {
            unsafe {
                ffi::llama_sampler_chain_add(chain, sampler.ptr);
            }
            // Prevent the individual sampler from being freed (chain owns it now)
            sampler.ptr = ptr::null_mut();
        }

        LlamaSampler {
            ptr: chain,
            _is_chain: true,
        }
    }

    /// Create a top-p (nucleus) sampler.
    pub fn top_p(p: f32, min_keep: usize) -> Self {
        LlamaSampler {
            ptr: unsafe { ffi::llama_sampler_init_top_p(p, min_keep) },
            _is_chain: false,
        }
    }

    /// Create a min-p sampler.
    pub fn min_p(p: f32, min_keep: usize) -> Self {
        LlamaSampler {
            ptr: unsafe { ffi::llama_sampler_init_min_p(p, min_keep) },
            _is_chain: false,
        }
    }

    /// Create a temperature sampler.
    pub fn temp(t: f32) -> Self {
        LlamaSampler {
            ptr: unsafe { ffi::llama_sampler_init_temp(t) },
            _is_chain: false,
        }
    }

    /// Create a random distribution sampler with a seed.
    pub fn dist(seed: u32) -> Self {
        LlamaSampler {
            ptr: unsafe { ffi::llama_sampler_init_dist(seed) },
            _is_chain: false,
        }
    }

    /// Sample the next token from the context at the given logit index.
    /// Use idx = -1 for the last token in the batch.
    pub fn sample(&mut self, ctx: &LlamaContext, idx: i32) -> LlamaToken {
        unsafe { ffi::llama_sampler_sample(self.ptr, ctx.ptr as *mut _, idx) }
    }

    /// Accept a token (update sampler state for the next sampling step).
    pub fn accept(&mut self, token: LlamaToken) {
        unsafe {
            ffi::llama_sampler_accept(self.ptr, token);
        }
    }
}

impl Drop for LlamaSampler {
    fn drop(&mut self) {
        if !self.ptr.is_null() {
            unsafe {
                ffi::llama_sampler_free(self.ptr);
            }
        }
    }
}

// ─── Vision (CLIP + LLaVA) re-exports ───────────────────────────────────────

// Re-export raw FFI types for vision. Native runtime manages these directly.
pub use ffi::clip_ctx;
pub use ffi::llava_image_embed;
pub use ffi::clip_model_load;
pub use ffi::clip_free;
pub use ffi::clip_n_mmproj_embd;
pub use ffi::llava_image_embed_make_with_filename;
pub use ffi::llava_image_embed_make_with_bytes;
pub use ffi::llava_eval_image_embed;
pub use ffi::llava_image_embed_free;
pub use ffi::llava_validate_embed_size;

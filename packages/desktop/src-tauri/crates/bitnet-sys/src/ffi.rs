// ffi.rs — Raw C FFI bindings to BitNet.cpp's llama.h API.
//
// These are manual bindings (no bindgen) for stability and zero build-time deps.
// Only the functions used by native_runtime.rs are bound.
//
// Source: 3rdparty/BitNet/3rdparty/llama.cpp/include/llama.h

#![allow(non_camel_case_types, non_upper_case_globals, dead_code)]

use std::os::raw::{c_char, c_float, c_int, c_void};

// ─── Opaque Types ────────────────────────────────────────────────────────────

/// Opaque model handle.
pub enum llama_model {}

/// Opaque context handle.
pub enum llama_context {}

/// Opaque sampler handle.
pub enum llama_sampler {}

// ─── Primitive Types ─────────────────────────────────────────────────────────

pub type llama_token = i32;
pub type llama_pos = i32;
pub type llama_seq_id = i32;

// ─── Struct Types ────────────────────────────────────────────────────────────

/// llama_batch — token batch for decode.
/// Copy is safe: this struct contains pointers and integers; copying it copies
/// the pointer values (not the pointed-to data), matching the C pass-by-value ABI.
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct llama_batch {
    pub n_tokens: i32,
    pub token: *mut llama_token,
    pub embd: *mut c_float,
    pub pos: *mut llama_pos,
    pub n_seq_id: *mut i32,
    pub seq_id: *mut *mut llama_seq_id,
    pub logits: *mut i8,
    // Used by llama_batch_get_one for simple batches
    pub all_pos_0: llama_pos,
    pub all_pos_1: llama_pos,
    pub all_seq_id: llama_seq_id,
}

/// llama_model_params — parameters for model loading.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct llama_model_params {
    pub n_gpu_layers: i32,
    pub split_mode: c_int, // enum llama_split_mode
    pub main_gpu: i32,
    pub tensor_split: *const c_float,
    pub rpc_servers: *const c_char,
    pub progress_callback: *const c_void, // function pointer, we never set it
    pub progress_callback_user_data: *mut c_void,
    pub kv_overrides: *const c_void, // const struct llama_model_kv_override *
    pub vocab_only: bool,
    pub use_mmap: bool,
    pub use_mlock: bool,
    pub check_tensors: bool,
}

/// llama_context_params — parameters for context creation.
///
/// Field order matches llama.h exactly for correct C ABI layout.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct llama_context_params {
    pub n_ctx: u32,
    pub n_batch: u32,
    pub n_ubatch: u32,
    pub n_seq_max: u32,
    pub n_threads: i32,
    pub n_threads_batch: i32,

    pub rope_scaling_type: c_int, // enum llama_rope_scaling_type
    pub pooling_type: c_int,      // enum llama_pooling_type
    pub attention_type: c_int,    // enum llama_attention_type

    pub rope_freq_base: c_float,
    pub rope_freq_scale: c_float,
    pub yarn_ext_factor: c_float,
    pub yarn_attn_factor: c_float,
    pub yarn_beta_fast: c_float,
    pub yarn_beta_slow: c_float,
    pub yarn_orig_ctx: u32,
    pub defrag_thold: c_float,

    pub cb_eval: *const c_void, // ggml_backend_sched_eval_callback
    pub cb_eval_user_data: *mut c_void,

    pub type_k: c_int, // enum ggml_type
    pub type_v: c_int, // enum ggml_type

    pub logits_all: bool,
    pub embeddings: bool,
    pub offload_kqv: bool,
    pub flash_attn: bool,
    pub no_perf: bool,

    pub abort_callback: *const c_void, // ggml_abort_callback
    pub abort_callback_data: *mut c_void,
}

/// llama_sampler_chain_params — params for sampler chain creation.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct llama_sampler_chain_params {
    pub no_perf: bool,
}

// ─── Logging ─────────────────────────────────────────────────────────────────

/// ggml_log_callback type (for llama_log_set)
pub type ggml_log_callback =
    Option<unsafe extern "C" fn(level: c_int, text: *const c_char, user_data: *mut c_void)>;

// ─── Extern C Functions ──────────────────────────────────────────────────────

extern "C" {
    // Backend lifecycle
    pub fn llama_backend_init();
    pub fn llama_backend_free();
    pub fn llama_log_set(log_callback: ggml_log_callback, user_data: *mut c_void);

    // Default parameters
    pub fn llama_model_default_params() -> llama_model_params;
    pub fn llama_context_default_params() -> llama_context_params;
    pub fn llama_sampler_chain_default_params() -> llama_sampler_chain_params;

    // Model lifecycle
    pub fn llama_load_model_from_file(
        path_model: *const c_char,
        params: llama_model_params,
    ) -> *mut llama_model;
    pub fn llama_free_model(model: *mut llama_model);

    // Model info
    pub fn llama_n_embd(model: *const llama_model) -> i32;
    pub fn llama_model_n_params(model: *const llama_model) -> u64;

    // Context lifecycle
    pub fn llama_new_context_with_model(
        model: *mut llama_model,
        params: llama_context_params,
    ) -> *mut llama_context;
    pub fn llama_free(ctx: *mut llama_context);

    // Batch operations
    pub fn llama_batch_init(n_tokens: i32, embd: i32, n_seq_max: i32) -> llama_batch;
    pub fn llama_batch_free(batch: llama_batch);
    pub fn llama_batch_get_one(
        tokens: *mut llama_token,
        n_tokens: i32,
        pos_0: llama_pos,
        seq_id: llama_seq_id,
    ) -> llama_batch;

    // Decode
    pub fn llama_decode(ctx: *mut llama_context, batch: llama_batch) -> i32;

    // KV cache
    pub fn llama_kv_cache_clear(ctx: *mut llama_context);

    // Embeddings
    pub fn llama_get_embeddings(ctx: *mut llama_context) -> *mut c_float;
    pub fn llama_get_embeddings_ith(ctx: *mut llama_context, i: i32) -> *mut c_float;
    pub fn llama_get_embeddings_seq(ctx: *mut llama_context, seq_id: llama_seq_id)
        -> *mut c_float;

    // Tokenization
    pub fn llama_tokenize(
        model: *const llama_model,
        text: *const c_char,
        text_len: i32,
        tokens: *mut llama_token,
        n_tokens_max: i32,
        add_special: bool,
        parse_special: bool,
    ) -> i32;

    pub fn llama_token_to_piece(
        model: *const llama_model,
        token: llama_token,
        buf: *mut c_char,
        length: i32,
        lstrip: i32,
        special: bool,
    ) -> i32;

    // Special tokens
    pub fn llama_token_is_eog(model: *const llama_model, token: llama_token) -> bool;
    pub fn llama_token_bos(model: *const llama_model) -> llama_token;
    pub fn llama_token_eos(model: *const llama_model) -> llama_token;

    // Sampler chain
    pub fn llama_sampler_chain_init(params: llama_sampler_chain_params) -> *mut llama_sampler;
    pub fn llama_sampler_chain_add(chain: *mut llama_sampler, smpl: *mut llama_sampler);

    // Sampler operations
    pub fn llama_sampler_sample(
        smpl: *mut llama_sampler,
        ctx: *mut llama_context,
        idx: i32,
    ) -> llama_token;
    pub fn llama_sampler_accept(smpl: *mut llama_sampler, token: llama_token);
    pub fn llama_sampler_free(smpl: *mut llama_sampler);

    // Sampler constructors
    pub fn llama_sampler_init_top_p(p: c_float, min_keep: usize) -> *mut llama_sampler;
    pub fn llama_sampler_init_min_p(p: c_float, min_keep: usize) -> *mut llama_sampler;
    pub fn llama_sampler_init_temp(t: c_float) -> *mut llama_sampler;
    pub fn llama_sampler_init_dist(seed: u32) -> *mut llama_sampler;
}

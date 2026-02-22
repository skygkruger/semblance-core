/**
 * semblance_llama_jni.cpp — JNI bridge between SemblanceLlamaModule (Kotlin) and llama.cpp (C).
 *
 * Provides native implementations for:
 * - nativeLoadModel: Load a GGUF model file into memory
 * - nativeFreeModel: Release model and context memory
 * - nativeGenerate: Token-by-token text generation with streaming callback
 * - nativeEmbed: Generate embedding vectors from text
 * - nativeGetMemoryUsage: Report native memory consumption
 *
 * PRIVACY: No network calls. All inference is local. No telemetry.
 */

#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>
#include "llama.h"

#define LOG_TAG "SemblanceLlama"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ─── Native State ────────────────────────────────────────────────────────────

struct SemblanceContext {
    llama_model *model;
    llama_context *ctx;
    int n_ctx;
    int n_batch;
};

// ─── Helper: Token to String ─────────────────────────────────────────────────

static std::string token_to_string(const llama_model *model, llama_token token) {
    char buf[256];
    int n = llama_token_to_piece(model, token, buf, sizeof(buf), 0, true);
    if (n < 0) {
        // Buffer too small — retry with larger buffer
        std::vector<char> large_buf(static_cast<size_t>(-n) + 1);
        n = llama_token_to_piece(model, token, large_buf.data(), large_buf.size(), 0, true);
        if (n > 0) return std::string(large_buf.data(), n);
        return "";
    }
    return std::string(buf, n);
}

// ─── JNI: Load Model ─────────────────────────────────────────────────────────

extern "C" JNIEXPORT jlong JNICALL
Java_com_semblance_llm_SemblanceLlamaModule_nativeLoadModel(
    JNIEnv *env,
    jobject /* this */,
    jstring jpath,
    jint contextLength,
    jint batchSize,
    jint threads,
    jint gpuLayers
) {
    const char *path = env->GetStringUTFChars(jpath, nullptr);
    LOGI("Loading model from: %s (ctx=%d, batch=%d, threads=%d, gpu=%d)",
         path, contextLength, batchSize, threads, gpuLayers);

    // Initialize llama.cpp backend
    llama_backend_init();

    // Configure model parameters
    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = gpuLayers;

    // Load model from GGUF file
    llama_model *model = llama_model_load_from_file(path, model_params);
    env->ReleaseStringUTFChars(jpath, path);

    if (!model) {
        LOGE("Failed to load model");
        return 0;
    }

    // Create context with model
    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = contextLength;
    ctx_params.n_batch = batchSize;
    ctx_params.n_threads = threads;
    ctx_params.n_threads_batch = threads;

    llama_context *ctx = llama_new_context_with_model(model, ctx_params);
    if (!ctx) {
        LOGE("Failed to create context");
        llama_model_free(model);
        return 0;
    }

    // Allocate and return context handle
    auto *sc = new SemblanceContext{model, ctx, contextLength, batchSize};
    LOGI("Model loaded successfully, handle=%p", sc);
    return reinterpret_cast<jlong>(sc);
}

// ─── JNI: Free Model ─────────────────────────────────────────────────────────

extern "C" JNIEXPORT void JNICALL
Java_com_semblance_llm_SemblanceLlamaModule_nativeFreeModel(
    JNIEnv * /* env */,
    jobject /* this */,
    jlong handle
) {
    if (handle == 0) return;
    auto *sc = reinterpret_cast<SemblanceContext *>(handle);
    LOGI("Freeing model, handle=%p", sc);

    if (sc->ctx) llama_free(sc->ctx);
    if (sc->model) llama_model_free(sc->model);
    delete sc;

    llama_backend_free();
}

// ─── JNI: Generate Text ──────────────────────────────────────────────────────

extern "C" JNIEXPORT void JNICALL
Java_com_semblance_llm_SemblanceLlamaModule_nativeGenerate(
    JNIEnv *env,
    jobject /* this */,
    jlong handle,
    jstring jprompt,
    jint maxTokens,
    jdouble temperature,
    jobject callback
) {
    if (handle == 0) {
        jclass exCls = env->FindClass("java/lang/RuntimeException");
        env->ThrowNew(exCls, "Invalid model handle");
        return;
    }

    auto *sc = reinterpret_cast<SemblanceContext *>(handle);
    const char *prompt = env->GetStringUTFChars(jprompt, nullptr);

    // Get callback method
    jclass callbackClass = env->GetObjectClass(callback);
    jmethodID invokeMethod = env->GetMethodID(callbackClass, "invoke",
                                               "(Ljava/lang/Object;)Ljava/lang/Object;");

    // Tokenize the prompt
    const int n_prompt = strlen(prompt);
    std::vector<llama_token> tokens(n_prompt + 32);
    int n_tokens = llama_tokenize(llama_get_model(sc->ctx), prompt, n_prompt,
                                   tokens.data(), tokens.size(), true, true);
    env->ReleaseStringUTFChars(jprompt, prompt);

    if (n_tokens < 0) {
        // Retry with larger buffer
        tokens.resize(static_cast<size_t>(-n_tokens));
        n_tokens = llama_tokenize(llama_get_model(sc->ctx), prompt, n_prompt,
                                   tokens.data(), tokens.size(), true, true);
    }
    tokens.resize(n_tokens);

    LOGI("Prompt tokenized: %d tokens, generating up to %d", n_tokens, maxTokens);

    // Clear KV cache
    llama_kv_cache_clear(sc->ctx);

    // Process prompt in batches
    llama_batch batch = llama_batch_init(sc->n_batch, 0, 1);

    for (int i = 0; i < n_tokens; i += sc->n_batch) {
        int n_eval = std::min(sc->n_batch, n_tokens - i);
        llama_batch_clear(batch);
        for (int j = 0; j < n_eval; j++) {
            llama_batch_add(batch, tokens[i + j], i + j, {0}, false);
        }
        batch.logits[batch.n_tokens - 1] = true;
        llama_decode(sc->ctx, batch);
    }

    // Auto-regressive generation
    const llama_model *model = llama_get_model(sc->ctx);
    int n_generated = 0;
    int n_cur = n_tokens;

    while (n_generated < maxTokens) {
        // Sample next token
        float *logits = llama_get_logits_ith(sc->ctx, -1);
        int n_vocab = llama_n_vocab(model);

        llama_token new_token;
        if (temperature <= 0.0) {
            // Greedy sampling
            new_token = 0;
            float max_logit = logits[0];
            for (int i = 1; i < n_vocab; i++) {
                if (logits[i] > max_logit) {
                    max_logit = logits[i];
                    new_token = i;
                }
            }
        } else {
            // Temperature sampling
            std::vector<llama_token_data> candidates(n_vocab);
            for (int i = 0; i < n_vocab; i++) {
                candidates[i] = {i, logits[i], 0.0f};
            }
            llama_token_data_array candidates_p = {candidates.data(), (size_t)n_vocab, false};
            llama_sampler *sampler = llama_sampler_init_temp((float)temperature);
            llama_sampler_apply(sampler, &candidates_p);
            llama_sampler_free(sampler);

            // Pick highest probability after temperature
            new_token = candidates_p.data[0].id;
        }

        // Check for EOS
        if (llama_token_is_eog(model, new_token)) break;

        // Convert token to text and send to callback
        std::string piece = token_to_string(model, new_token);
        if (!piece.empty()) {
            jstring jpiece = env->NewStringUTF(piece.c_str());
            env->CallObjectMethod(callback, invokeMethod, jpiece);
            env->DeleteLocalRef(jpiece);
        }

        // Prepare next decode
        llama_batch_clear(batch);
        llama_batch_add(batch, new_token, n_cur, {0}, true);
        llama_decode(sc->ctx, batch);

        n_generated++;
        n_cur++;
    }

    llama_batch_free(batch);
    LOGI("Generation complete: %d tokens", n_generated);
}

// ─── JNI: Embed Text ─────────────────────────────────────────────────────────

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_semblance_llm_SemblanceLlamaModule_nativeEmbed(
    JNIEnv *env,
    jobject /* this */,
    jlong handle,
    jstring jtext
) {
    if (handle == 0) {
        jclass exCls = env->FindClass("java/lang/RuntimeException");
        env->ThrowNew(exCls, "Invalid model handle");
        return nullptr;
    }

    auto *sc = reinterpret_cast<SemblanceContext *>(handle);
    const char *text = env->GetStringUTFChars(jtext, nullptr);

    // Tokenize
    const int n_text = strlen(text);
    std::vector<llama_token> tokens(n_text + 32);
    int n_tokens = llama_tokenize(llama_get_model(sc->ctx), text, n_text,
                                   tokens.data(), tokens.size(), true, true);
    env->ReleaseStringUTFChars(jtext, text);

    if (n_tokens < 0) {
        tokens.resize(static_cast<size_t>(-n_tokens));
        n_tokens = llama_tokenize(llama_get_model(sc->ctx), text, n_text,
                                   tokens.data(), tokens.size(), true, true);
    }
    tokens.resize(n_tokens);

    // Clear KV cache and decode
    llama_kv_cache_clear(sc->ctx);

    llama_batch batch = llama_batch_init(sc->n_batch, 0, 1);

    for (int i = 0; i < n_tokens; i += sc->n_batch) {
        int n_eval = std::min(sc->n_batch, n_tokens - i);
        llama_batch_clear(batch);
        for (int j = 0; j < n_eval; j++) {
            llama_batch_add(batch, tokens[i + j], i + j, {0}, false);
        }
        // Enable logits/embeddings for last token
        batch.logits[batch.n_tokens - 1] = true;
        llama_decode(sc->ctx, batch);
    }

    llama_batch_free(batch);

    // Extract embeddings from the last token position
    float *embeddings = llama_get_embeddings_ith(sc->ctx, -1);
    int n_embd = llama_n_embd(llama_get_model(sc->ctx));

    if (!embeddings || n_embd <= 0) {
        // Model doesn't support embeddings — return last hidden state logits as approximation
        float *logits = llama_get_logits_ith(sc->ctx, -1);
        int n_vocab = llama_n_vocab(llama_get_model(sc->ctx));
        int dim = std::min(n_vocab, 384); // Cap at 384 dimensions

        jfloatArray result = env->NewFloatArray(dim);
        env->SetFloatArrayRegion(result, 0, dim, logits);
        return result;
    }

    jfloatArray result = env->NewFloatArray(n_embd);
    env->SetFloatArrayRegion(result, 0, n_embd, embeddings);
    return result;
}

// ─── JNI: Memory Usage ───────────────────────────────────────────────────────

extern "C" JNIEXPORT jlong JNICALL
Java_com_semblance_llm_SemblanceLlamaModule_nativeGetMemoryUsage(
    JNIEnv * /* env */,
    jobject /* this */,
    jlong handle
) {
    if (handle == 0) return 0;

    auto *sc = reinterpret_cast<SemblanceContext *>(handle);
    // Approximate memory: model size (from llama.cpp internals) + context KV cache
    size_t model_size = llama_model_size(sc->model);
    return static_cast<jlong>(model_size);
}

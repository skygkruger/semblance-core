// SemblanceLlamaModule — React Native native module for llama.cpp inference on Android.
//
// Implements the MobileInferenceBridge interface via React Native's native module
// system. Uses llama.cpp C++ library via JNI for GGUF model inference.
//
// MODEL LOADING: Accepts a file path to a downloaded GGUF model on internal storage.
// GPU acceleration via Vulkan if available, CPU fallback otherwise.
//
// GENERATION: Streaming token output via React Native events.
// The JS-side MobileInferenceBridge.generate() maps to this via event subscription.
//
// MEMORY: Monitors available RAM. Respects Android's memory limits for background processes.
//
// PRIVACY: No network calls. All inference is local. No telemetry.

package com.semblance.llm

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class SemblanceLlamaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    // State
    private var isLoaded = false
    private var modelPath: String? = null
    private var contextLength = 2048
    private var batchSize = 32
    private var gpuLayers = 0
    private var nativeHandle: Long = 0
    @Volatile private var isGenerating = false

    override fun getName(): String = "SemblanceLlama"

    // ─── Model Lifecycle ─────────────────────────────────────────────────────

    /**
     * Load a GGUF model from a file path on device storage.
     * GPU acceleration via Vulkan if supported, CPU fallback otherwise.
     */
    @ReactMethod
    fun loadModel(
        modelPath: String,
        contextLength: Int,
        batchSize: Int,
        threads: Int,
        gpuLayers: Int,
        promise: Promise
    ) {
        if (isGenerating) {
            promise.reject("BUSY", "Cannot load model while inference is in progress.")
            return
        }

        Thread {
            try {
                val file = File(modelPath)
                if (!file.exists()) {
                    promise.reject("MODEL_NOT_FOUND", "Model file not found at $modelPath")
                    return@Thread
                }

                // Check available memory before loading
                val runtime = Runtime.getRuntime()
                val availableMemory = runtime.maxMemory() - runtime.totalMemory() + runtime.freeMemory()
                val minimumMemory = 512L * 1024 * 1024 // 512MB minimum
                if (availableMemory < minimumMemory) {
                    promise.reject(
                        "INSUFFICIENT_MEMORY",
                        "Not enough memory to load model. Available: ${availableMemory / 1024 / 1024}MB"
                    )
                    return@Thread
                }

                // Unload existing model if any
                if (nativeHandle != 0L) {
                    nativeFreeModel(nativeHandle)
                    nativeHandle = 0
                }

                this.modelPath = modelPath
                this.contextLength = contextLength
                this.batchSize = batchSize
                this.gpuLayers = gpuLayers

                // Load model via JNI — llama_model_load_from_file
                val effectiveThreads = if (threads <= 0) Runtime.getRuntime().availableProcessors() else threads
                nativeHandle = nativeLoadModel(modelPath, contextLength, batchSize, effectiveThreads, gpuLayers)

                if (nativeHandle == 0L) {
                    promise.reject("LOAD_FAILED", "llama.cpp failed to load model from $modelPath")
                    return@Thread
                }

                isLoaded = true

                val result = Arguments.createMap()
                result.putString("status", "loaded")
                result.putString("modelPath", modelPath)
                result.putInt("contextLength", contextLength)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("LOAD_ERROR", "Failed to load model: ${e.message}")
            }
        }.start()
    }

    /**
     * Unload the currently loaded model to free memory.
     */
    @ReactMethod
    fun unloadModel(promise: Promise) {
        if (isGenerating) {
            promise.reject("BUSY", "Cannot unload while inference is in progress.")
            return
        }

        try {
            if (nativeHandle != 0L) {
                nativeFreeModel(nativeHandle)
            }
            nativeHandle = 0
            isLoaded = false
            modelPath = null

            // Suggest GC after releasing native memory
            System.gc()

            val result = Arguments.createMap()
            result.putString("status", "unloaded")
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("UNLOAD_ERROR", "Failed to unload model: ${e.message}")
        }
    }

    /**
     * Check if a model is currently loaded.
     */
    @ReactMethod
    fun isModelLoaded(promise: Promise) {
        promise.resolve(isLoaded)
    }

    // ─── Inference ───────────────────────────────────────────────────────────

    /**
     * Generate text from a prompt. Sends streaming tokens via React Native events.
     */
    @ReactMethod
    fun generate(
        prompt: String,
        maxTokens: Int,
        temperature: Double,
        systemPrompt: String?,
        promise: Promise
    ) {
        if (!isLoaded || nativeHandle == 0L) {
            promise.reject("NOT_LOADED", "No model loaded. Call loadModel() first.")
            return
        }

        if (isGenerating) {
            promise.reject("BUSY", "Inference already in progress. Wait for completion.")
            return
        }

        isGenerating = true

        Thread {
            try {
                val startTime = System.currentTimeMillis()

                // Build full prompt with optional system message
                val fullPrompt = if (systemPrompt != null && systemPrompt.isNotEmpty()) {
                    "<|system|>\n$systemPrompt\n<|user|>\n$prompt\n<|assistant|>\n"
                } else {
                    prompt
                }

                // Run llama.cpp generation via JNI with streaming callback
                val generatedTokens = mutableListOf<String>()
                nativeGenerate(nativeHandle, fullPrompt, maxTokens, temperature) { token ->
                    generatedTokens.add(token)
                    sendTokenEvent(token)
                }

                val fullText = generatedTokens.joinToString("")
                val durationMs = System.currentTimeMillis() - startTime
                val tokensPerSecond = if (durationMs > 0) generatedTokens.size * 1000.0 / durationMs else 0.0

                isGenerating = false

                val result = Arguments.createMap()
                result.putString("text", fullText)
                result.putInt("tokensGenerated", generatedTokens.size)
                result.putDouble("durationMs", durationMs.toDouble())
                result.putDouble("tokensPerSecond", tokensPerSecond)
                promise.resolve(result)
            } catch (e: Exception) {
                isGenerating = false
                promise.reject("GENERATE_ERROR", "Generation failed: ${e.message}")
            }
        }.start()
    }

    /**
     * Generate embeddings for input text.
     */
    @ReactMethod
    fun embed(text: String, promise: Promise) {
        if (!isLoaded || nativeHandle == 0L) {
            promise.reject("NOT_LOADED", "No model loaded. Call loadModel() first.")
            return
        }

        Thread {
            try {
                // Run llama.cpp embedding via JNI
                val embeddingArray = nativeEmbed(nativeHandle, text)

                val embedding = Arguments.createArray()
                for (value in embeddingArray) {
                    embedding.pushDouble(value.toDouble())
                }

                val result = Arguments.createMap()
                result.putArray("embedding", embedding)
                result.putInt("dimensions", embeddingArray.size)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("EMBED_ERROR", "Embedding failed: ${e.message}")
            }
        }.start()
    }

    // ─── Memory Management ───────────────────────────────────────────────────

    /**
     * Get current memory usage information.
     */
    @ReactMethod
    fun getMemoryUsage(promise: Promise) {
        val runtime = Runtime.getRuntime()
        val maxMemory = runtime.maxMemory()
        val totalMemory = runtime.totalMemory()
        val freeMemory = runtime.freeMemory()
        val nativeMemory = if (nativeHandle != 0L) nativeGetMemoryUsage(nativeHandle) else 0L

        val result = Arguments.createMap()
        result.putDouble("used", nativeMemory.toDouble())
        result.putDouble("available", (maxMemory - totalMemory + freeMemory).toDouble())
        result.putDouble("maxMemory", maxMemory.toDouble())
        result.putBoolean("modelLoaded", isLoaded)
        promise.resolve(result)
    }

    /**
     * Get the platform identifier.
     */
    @ReactMethod
    fun getPlatform(promise: Promise) {
        promise.resolve("android")
    }

    // ─── Token Streaming ─────────────────────────────────────────────────────

    private fun sendTokenEvent(token: String) {
        val params = Arguments.createMap()
        params.putString("token", token)
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onToken", params)
    }

    private fun sendModelUnloadedEvent(reason: String) {
        val params = Arguments.createMap()
        params.putString("reason", reason)
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onModelUnloaded", params)
    }

    // ─── Memory Pressure ─────────────────────────────────────────────────────

    /**
     * Called when Android detects memory pressure (via Application.onTrimMemory).
     * Unloads the model if memory is critically low.
     */
    fun onTrimMemory(level: Int) {
        // TRIM_MEMORY_RUNNING_CRITICAL = 15
        if (level >= 15 && isLoaded && !isGenerating) {
            if (nativeHandle != 0L) {
                nativeFreeModel(nativeHandle)
            }
            nativeHandle = 0
            isLoaded = false
            modelPath = null
            sendModelUnloadedEvent("memory_pressure")
        }
    }

    // ─── JNI Native Methods ──────────────────────────────────────────────────

    companion object {
        init {
            try {
                System.loadLibrary("semblance_llama")
            } catch (_: UnsatisfiedLinkError) {
                // Library not available yet — built with NDK during Android build
            }
        }
    }

    /**
     * Load a GGUF model file. Returns a native handle (pointer) or 0 on failure.
     * Calls llama_model_load_from_file and llama_new_context_with_model.
     */
    private external fun nativeLoadModel(
        path: String,
        contextLength: Int,
        batchSize: Int,
        threads: Int,
        gpuLayers: Int
    ): Long

    /**
     * Free a previously loaded model and its context.
     * Calls llama_free and llama_model_free.
     */
    private external fun nativeFreeModel(handle: Long)

    /**
     * Generate tokens from a prompt. Calls the streaming callback for each token.
     * Uses llama_decode and llama_token_to_piece for token-by-token generation.
     */
    private external fun nativeGenerate(
        handle: Long,
        prompt: String,
        maxTokens: Int,
        temperature: Double,
        callback: (String) -> Unit
    )

    /**
     * Generate an embedding vector for the input text.
     * Uses llama_decode with embedding mode to extract the hidden state.
     */
    private external fun nativeEmbed(handle: Long, text: String): FloatArray

    /**
     * Get the native memory usage of the loaded model in bytes.
     */
    private external fun nativeGetMemoryUsage(handle: Long): Long
}

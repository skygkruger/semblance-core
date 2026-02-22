// SemblanceMLXModule — React Native native module for MLX inference on iOS.
//
// Implements the MobileInferenceBridge interface via React Native's native module
// system. Uses mlx-swift to load and run GGUF models on Apple Silicon (A14+).
//
// MODEL LOADING: Accepts a file path to a downloaded GGUF model on device storage.
// Metal GPU acceleration is managed automatically by MLX.
//
// GENERATION: Streaming token output via React Native events.
// The JS-side MobileInferenceBridge.generate() maps to this via event subscription.
//
// MEMORY: Monitors available memory. On iOS memory warning, optionally unloads
// the model and notifies JS.
//
// PRIVACY: No network calls. All inference is local. No telemetry.

import Foundation
// import MLX // Uncomment when mlx-swift is integrated via SPM
// import MLXNN
// import MLXRandom

@objc(SemblanceMLX)
class SemblanceMLXModule: NSObject {
    // MARK: - State

    private var isLoaded = false
    private var modelPath: String?
    private var contextLength: Int = 2048
    private var batchSize: Int = 32
    private var gpuLayers: Int = 32

    // MARK: - React Native Module Setup

    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // MARK: - Model Lifecycle

    /// Load a GGUF model from a file path on device storage.
    /// Metal GPU acceleration is configured automatically by MLX.
    @objc func loadModel(
        _ modelPath: String,
        contextLength: Int,
        batchSize: Int,
        threads: Int,
        gpuLayers: Int,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            // Verify file exists
            guard FileManager.default.fileExists(atPath: modelPath) else {
                reject("MODEL_NOT_FOUND", "Model file not found at \(modelPath)", nil)
                return
            }

            self.modelPath = modelPath
            self.contextLength = contextLength
            self.batchSize = batchSize
            self.gpuLayers = gpuLayers

            // TODO: Initialize MLX model from GGUF file
            // let model = try MLXModel(path: modelPath)
            // model.configure(contextLength: contextLength, batchSize: batchSize)

            self.isLoaded = true
            resolve(["status": "loaded", "modelPath": modelPath])
        }
    }

    /// Unload the currently loaded model to free memory.
    @objc func unloadModel(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        isLoaded = false
        modelPath = nil
        // TODO: Release MLX model memory
        resolve(["status": "unloaded"])
    }

    /// Check if a model is currently loaded.
    @objc func isModelLoaded(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(isLoaded)
    }

    // MARK: - Inference

    /// Generate text from a prompt. Sends streaming tokens via React Native events.
    /// The JS layer converts event-based streaming to AsyncIterable<string>.
    @objc func generate(
        _ prompt: String,
        maxTokens: Int,
        temperature: Double,
        systemPrompt: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard isLoaded else {
            reject("NOT_LOADED", "No model loaded. Call loadModel() first.", nil)
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            let startTime = Date()

            // TODO: Run MLX inference
            // var fullPrompt = prompt
            // if let sys = systemPrompt { fullPrompt = "<|system|>\n\(sys)\n<|user|>\n\(prompt)\n<|assistant|>\n" }
            // let tokens = model.generate(prompt: fullPrompt, maxTokens: maxTokens, temperature: temperature)
            // for token in tokens { self.sendEvent("onToken", body: ["token": token]) }

            let durationMs = Date().timeIntervalSince(startTime) * 1000

            resolve([
                "text": "[MLX inference placeholder]",
                "tokensGenerated": 0,
                "durationMs": durationMs,
            ])
        }
    }

    /// Generate embeddings for input text.
    @objc func embed(
        _ text: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard isLoaded else {
            reject("NOT_LOADED", "No model loaded. Call loadModel() first.", nil)
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            // TODO: Run MLX embedding model
            // let embedding = embeddingModel.embed(text)

            // Placeholder: return zeros
            let dim = 384
            let embedding = Array(repeating: Float(0.0), count: dim)

            resolve(["embedding": embedding, "dimensions": dim])
        }
    }

    // MARK: - Memory Management

    /// Get current memory usage information.
    @objc func getMemoryUsage(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let processInfo = ProcessInfo.processInfo
        let physicalMemory = processInfo.physicalMemory

        // os_proc_available_memory() gives available memory on iOS 13+
        var available: UInt64 = 0
        if #available(iOS 13.0, *) {
            available = os_proc_available_memory()
        }

        let used = isLoaded ? UInt64(1_500_000_000) : 0 // Approximate model size

        resolve([
            "used": used,
            "available": available,
            "totalPhysical": physicalMemory,
        ])
    }

    /// Get the platform identifier.
    @objc func getPlatform(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve("ios")
    }

    // MARK: - Memory Warning Handler

    /// Called when iOS sends a memory warning. Optionally unloads the model.
    @objc func handleMemoryWarning() {
        // If model is loaded, unload to free memory
        if isLoaded {
            isLoaded = false
            modelPath = nil
            // TODO: Release MLX model
            // TODO: Send event to JS: "onModelUnloaded" with reason "memory_pressure"
        }
    }
}

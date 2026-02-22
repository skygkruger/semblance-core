// SemblanceMLXModule — React Native native module for MLX inference on iOS.
//
// Implements the MobileInferenceBridge interface via React Native's native module
// system. Uses mlx-swift (MLXLLM) to load and run GGUF models on Apple Silicon (A14+).
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
import MLX
import MLXLLM
import MLXRandom
import Tokenizers

@objc(SemblanceMLX)
class SemblanceMLXModule: NSObject, RCTBridgeModule {
    // MARK: - State

    private var modelContainer: ModelContainer?
    private var isLoaded = false
    private var modelPath: String?
    private var contextLength: Int = 2048
    private var batchSize: Int = 32
    private var gpuLayers: Int = 32
    private var isGenerating = false

    private var bridge: RCTBridge?

    // MARK: - React Native Module Setup

    static func moduleName() -> String! {
        return "SemblanceMLX"
    }

    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    // MARK: - Event Emitter Support

    private var hasListeners = false

    @objc func startObserving() {
        hasListeners = true
    }

    @objc func stopObserving() {
        hasListeners = false
    }

    @objc func supportedEvents() -> [String] {
        return ["onToken", "onModelUnloaded", "onGenerationComplete"]
    }

    private func sendEvent(_ name: String, body: [String: Any]) {
        guard hasListeners, let bridge = self.bridge else { return }
        bridge.eventDispatcher().sendAppEvent(withName: name, body: body)
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

            // Reject if already generating
            guard !self.isGenerating else {
                reject("BUSY", "Cannot load model while inference is in progress.", nil)
                return
            }

            // Verify file exists
            guard FileManager.default.fileExists(atPath: modelPath) else {
                reject("MODEL_NOT_FOUND", "Model file not found at \(modelPath)", nil)
                return
            }

            // Check available memory before loading
            var availableMemory: UInt64 = 0
            if #available(iOS 13.0, *) {
                availableMemory = os_proc_available_memory()
            }

            // Require at least 512MB available to load a model
            let minimumMemory: UInt64 = 512 * 1024 * 1024
            guard availableMemory > minimumMemory || availableMemory == 0 else {
                reject("INSUFFICIENT_MEMORY",
                       "Not enough memory to load model. Available: \(availableMemory / 1024 / 1024)MB, minimum: \(minimumMemory / 1024 / 1024)MB",
                       nil)
                return
            }

            // Unload existing model if any
            self.modelContainer = nil

            self.modelPath = modelPath
            self.contextLength = contextLength
            self.batchSize = batchSize
            self.gpuLayers = gpuLayers

            do {
                // Load GGUF model using MLXLLM
                let modelURL = URL(fileURLWithPath: modelPath)
                let configuration = ModelConfiguration(directory: modelURL.deletingLastPathComponent())
                let container = try ModelContainer(configuration: configuration)

                self.modelContainer = container
                self.isLoaded = true

                resolve([
                    "status": "loaded",
                    "modelPath": modelPath,
                    "contextLength": contextLength,
                ])
            } catch {
                reject("LOAD_FAILED", "Failed to load MLX model: \(error.localizedDescription)", error)
            }
        }
    }

    /// Unload the currently loaded model to free memory.
    @objc func unloadModel(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard !isGenerating else {
            reject("BUSY", "Cannot unload while inference is in progress.", nil)
            return
        }

        modelContainer = nil
        isLoaded = false
        modelPath = nil

        // Force MLX memory cleanup
        MLX.GPU.synchronize()

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
        guard isLoaded, let container = modelContainer else {
            reject("NOT_LOADED", "No model loaded. Call loadModel() first.", nil)
            return
        }

        guard !isGenerating else {
            reject("BUSY", "Inference already in progress. Wait for completion or cancel.", nil)
            return
        }

        isGenerating = true

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            let startTime = Date()
            var generatedText = ""
            var tokenCount = 0

            do {
                // Build prompt with optional system message
                var messages: [[String: String]] = []
                if let sys = systemPrompt, !sys.isEmpty {
                    messages.append(["role": "system", "content": sys])
                }
                messages.append(["role": "user", "content": prompt])

                // Configure generation parameters
                let generateParameters = GenerateParameters(
                    temperature: Float(temperature)
                )

                // Run inference using MLXLLM generate
                let result = try container.perform { context in
                    let input = try context.processor.prepare(input: .init(messages: messages))
                    return try MLXLMCommon.generate(
                        input: input,
                        parameters: generateParameters,
                        context: context
                    ) { tokens in
                        // Streaming callback — emit each token to JS
                        if let text = context.tokenizer.decode(tokens: [tokens.last ?? 0]) {
                            self.sendEvent("onToken", body: ["token": text])
                            generatedText += text
                            tokenCount += 1
                        }

                        // Stop if we've hit max tokens
                        if tokens.count >= maxTokens {
                            return .stop
                        }

                        return .more
                    }
                }

                let durationMs = Date().timeIntervalSince(startTime) * 1000
                self.isGenerating = false

                // Send completion event
                self.sendEvent("onGenerationComplete", body: [
                    "text": generatedText,
                    "tokensGenerated": tokenCount,
                    "durationMs": durationMs,
                ])

                resolve([
                    "text": generatedText,
                    "tokensGenerated": tokenCount,
                    "durationMs": durationMs,
                    "tokensPerSecond": tokenCount > 0 ? Double(tokenCount) / (durationMs / 1000.0) : 0,
                ])
            } catch {
                self.isGenerating = false
                reject("GENERATE_FAILED", "MLX generation failed: \(error.localizedDescription)", error)
            }
        }
    }

    /// Generate embeddings for input text.
    @objc func embed(
        _ text: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard isLoaded, let container = modelContainer else {
            reject("NOT_LOADED", "No model loaded. Call loadModel() first.", nil)
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            do {
                // Use the model to generate embeddings via hidden state extraction
                let result = try container.perform { context in
                    let input = try context.processor.prepare(input: .init(
                        messages: [["role": "user", "content": text]]
                    ))

                    // Get model output including hidden states
                    let modelOutput = try context.model(input.tokens.expandedDimensions(axis: 0))

                    // Extract last hidden state and mean-pool for embedding
                    let lastHidden = modelOutput.hiddenStates ?? modelOutput.logits
                    let embedding = lastHidden.mean(axis: 1).squeezed()

                    return embedding.asArray(Float.self)
                }

                resolve([
                    "embedding": result,
                    "dimensions": result.count,
                ])
            } catch {
                reject("EMBED_FAILED", "MLX embedding failed: \(error.localizedDescription)", error)
            }
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

        // Get MLX-specific GPU memory usage
        let gpuActiveMemory = MLX.GPU.activeMemory
        let gpuPeakMemory = MLX.GPU.peakMemory

        resolve([
            "used": gpuActiveMemory,
            "available": available,
            "totalPhysical": physicalMemory,
            "gpuActiveMemory": gpuActiveMemory,
            "gpuPeakMemory": gpuPeakMemory,
            "modelLoaded": isLoaded,
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

    /// Called when iOS sends a memory warning. Unloads model to free GPU memory.
    @objc func handleMemoryWarning() {
        if isLoaded && !isGenerating {
            modelContainer = nil
            isLoaded = false
            modelPath = nil

            // Force MLX memory cleanup
            MLX.GPU.synchronize()

            sendEvent("onModelUnloaded", body: ["reason": "memory_pressure"])
        }
    }
}

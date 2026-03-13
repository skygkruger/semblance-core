// BitNet Mobile Bridge — Wraps BitNet.cpp (compiled from source) for mobile inference.
//
// On both iOS and Android, BitNet.cpp is compiled via CMake as a static library.
// This bridge adapts the React Native native module (SemblanceBitNet) into
// the MobileInferenceBridge interface.
//
// Architecture:
//   - iOS: Static library linked into the app. TL1 kernels use ARM NEON + dotprod.
//          Linked against Accelerate.framework for BLAS ops.
//   - Android: .so built via NDK (arm64-v8a). TL1 kernels use ARM NEON.
//
// BitNet.cpp is a superset of llama.cpp — same API surface. The native module
// exposes the same methods as SemblanceLlama but is compiled from the BitNet fork
// with i2_s/TL1 kernel support for optimized 1-bit inference.
//
// Priority: Desktop handoff (Ollama GPU) > BitNet (local CPU) > MLX (iOS) / llama.cpp (Android)

import type {
  MobileInferenceBridge,
  MobilePlatform,
  MobileModelOptions,
  MobileGenerateOptions,
  MobileMemoryInfo,
} from '@semblance/core/llm/mobile-bridge-types.js';

// Native module interface — same shape as SemblanceLlama since BitNet.cpp
// exposes the same llama.h API surface.
interface SemblanceBitNetNativeModule {
  loadModel(
    modelPath: string,
    contextLength: number,
    batchSize: number,
    threads: number,
    gpuLayers: number,
  ): Promise<{ status: string; modelPath: string }>;
  unloadModel(): Promise<{ status: string }>;
  isModelLoaded(): Promise<boolean>;
  generate(
    prompt: string,
    maxTokens: number,
    temperature: number,
    systemPrompt: string | null,
  ): Promise<{ text: string; tokensGenerated: number; durationMs: number }>;
  embed(text: string): Promise<{ embedding: number[]; dimensions: number }>;
  getMemoryUsage(): Promise<{ used: number; available: number; maxMemory: number }>;
  getPlatform(): Promise<string>;
}

/**
 * BitNetMobileBridgeAdapter — Wraps the SemblanceBitNet native module
 * into MobileInferenceBridge.
 *
 * Works on both iOS and Android. The native module is the same API as
 * SemblanceLlama but compiled from the BitNet.cpp fork for optimized
 * 1-bit inference on ARM (TL1 kernels with NEON + dotprod).
 */
export class BitNetMobileBridgeAdapter implements MobileInferenceBridge {
  private nativeModule: SemblanceBitNetNativeModule;
  private loaded: boolean = false;
  private platform_: MobilePlatform;

  constructor(nativeModule: SemblanceBitNetNativeModule, platform: MobilePlatform) {
    this.nativeModule = nativeModule;
    this.platform_ = platform;
  }

  async loadModel(modelPath: string, options: MobileModelOptions): Promise<void> {
    await this.nativeModule.loadModel(
      modelPath,
      options.contextLength,
      options.batchSize,
      options.threads,
      options.gpuLayers ?? 0,
    );
    this.loaded = true;
  }

  async *generate(prompt: string, options: MobileGenerateOptions): AsyncIterable<string> {
    const result = await this.nativeModule.generate(
      prompt,
      options.maxTokens ?? 512,
      options.temperature ?? 0.7,
      options.systemPrompt ?? null,
    );
    yield result.text;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.nativeModule.embed(text);
    return result.embedding;
  }

  async unloadModel(): Promise<void> {
    await this.nativeModule.unloadModel();
    this.loaded = false;
  }

  isModelLoaded(): boolean {
    return this.loaded;
  }

  async getMemoryUsage(): Promise<MobileMemoryInfo> {
    const usage = await this.nativeModule.getMemoryUsage();
    return {
      used: usage.used,
      available: usage.available,
    };
  }

  getPlatform(): MobilePlatform {
    return this.platform_;
  }
}

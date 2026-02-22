// MLX Bridge — JS adapter wrapping the iOS native module (SemblanceMLX)
// into the MobileInferenceBridge interface.
//
// On non-iOS platforms, this module is never imported. The InferenceRouter
// detects the platform and selects the appropriate bridge.
//
// Streaming: The native module sends tokens via React Native events.
// This adapter converts event-based streaming to AsyncIterable<string>.

import type {
  MobileInferenceBridge,
  MobilePlatform,
  MobileModelOptions,
  MobileGenerateOptions,
  MobileMemoryInfo,
} from '@semblance/core/llm/mobile-bridge-types.js';

// NativeModules is imported at runtime only on React Native.
// Type-only import for build compatibility on non-RN environments.
interface SemblanceMLXNativeModule {
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
  getMemoryUsage(): Promise<{ used: number; available: number; totalPhysical: number }>;
  getPlatform(): Promise<string>;
}

/**
 * MLXBridgeAdapter — Wraps the iOS SemblanceMLX native module into MobileInferenceBridge.
 * Only instantiate on iOS. On other platforms, use MockMLXBridge or the Android bridge.
 */
export class MLXBridgeAdapter implements MobileInferenceBridge {
  private nativeModule: SemblanceMLXNativeModule;
  private loaded: boolean = false;

  constructor(nativeModule: SemblanceMLXNativeModule) {
    this.nativeModule = nativeModule;
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
    // For now, use non-streaming generate and yield the full response.
    // When the native module supports token-by-token events, this will
    // use React Native's NativeEventEmitter for true streaming.
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
    return 'ios';
  }
}

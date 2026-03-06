// Test implementations of MobileInferenceBridge.
// TestMLXBridge emulates iOS MLX inference.
// TestLlamaCppBridge emulates Android llama.cpp inference.
// Both return deterministic responses for predictable tests.
// CRITICAL: No network imports. No platform imports.

import type {
  MobileInferenceBridge,
  MobilePlatform,
  MobileModelOptions,
  MobileGenerateOptions,
  MobileMemoryInfo,
} from './mobile-bridge-types.js';

/**
 * TestMLXBridge — Emulates iOS MLX native module for testing.
 * Returns deterministic responses. Model loading is instant.
 */
export class TestMLXBridge implements MobileInferenceBridge {
  private loaded: boolean = false;
  private modelPath: string | null = null;
  private options: MobileModelOptions | null = null;

  async loadModel(modelPath: string, options: MobileModelOptions): Promise<void> {
    this.modelPath = modelPath;
    this.options = options;
    this.loaded = true;
  }

  async *generate(prompt: string, options: MobileGenerateOptions): AsyncIterable<string> {
    if (!this.loaded) throw new Error('[TestMLXBridge] No model loaded');

    const response = `[MLX] Response to: ${prompt.slice(0, 50)}`;
    const tokens = response.split(' ');
    for (const token of tokens) {
      yield token + ' ';
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) throw new Error('[TestMLXBridge] No model loaded');
    // Return a deterministic 384-dim embedding based on text length
    const dim = 384;
    const embedding: number[] = [];
    for (let i = 0; i < dim; i++) {
      embedding.push(Math.sin((text.length + i) * 0.01));
    }
    return embedding;
  }

  async unloadModel(): Promise<void> {
    this.loaded = false;
    this.modelPath = null;
    this.options = null;
  }

  isModelLoaded(): boolean {
    return this.loaded;
  }

  async getMemoryUsage(): Promise<MobileMemoryInfo> {
    return {
      used: this.loaded ? 1_500_000_000 : 0, // 1.5GB for loaded model
      available: 4_000_000_000, // 4GB available
    };
  }

  getPlatform(): MobilePlatform {
    return 'ios';
  }
}

/**
 * TestLlamaCppBridge — Emulates Android llama.cpp native module for testing.
 * Returns deterministic responses. Model loading is instant.
 */
export class TestLlamaCppBridge implements MobileInferenceBridge {
  private loaded: boolean = false;
  private modelPath: string | null = null;
  private options: MobileModelOptions | null = null;

  async loadModel(modelPath: string, options: MobileModelOptions): Promise<void> {
    this.modelPath = modelPath;
    this.options = options;
    this.loaded = true;
  }

  async *generate(prompt: string, options: MobileGenerateOptions): AsyncIterable<string> {
    if (!this.loaded) throw new Error('[TestLlamaCppBridge] No model loaded');

    const response = `[LlamaCpp] Response to: ${prompt.slice(0, 50)}`;
    const tokens = response.split(' ');
    for (const token of tokens) {
      yield token + ' ';
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.loaded) throw new Error('[TestLlamaCppBridge] No model loaded');
    const dim = 384;
    const embedding: number[] = [];
    for (let i = 0; i < dim; i++) {
      embedding.push(Math.cos((text.length + i) * 0.01));
    }
    return embedding;
  }

  async unloadModel(): Promise<void> {
    this.loaded = false;
    this.modelPath = null;
    this.options = null;
  }

  isModelLoaded(): boolean {
    return this.loaded;
  }

  async getMemoryUsage(): Promise<MobileMemoryInfo> {
    return {
      used: this.loaded ? 1_800_000_000 : 0, // 1.8GB for loaded model
      available: 3_500_000_000, // 3.5GB available
    };
  }

  getPlatform(): MobilePlatform {
    return 'android';
  }
}

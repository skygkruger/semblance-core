// MobileInferenceBridge — Contract between InferenceRouter and mobile native modules.
//
// iOS: MLX via Swift native module (mlx-swift).
// Android: llama.cpp via JNI/NDK native module.
//
// This interface is implemented by platform-specific React Native native modules
// and provided to the InferenceRouter via dependency injection.
//
// CRITICAL: No network imports. No platform imports. Pure interface definition.

/**
 * MobileInferenceBridge — Unified interface for mobile native inference.
 * Implemented by MLXBridge (iOS) and LlamaCppBridge (Android).
 */
export interface MobileInferenceBridge {
  /** Load a GGUF model from a file path on device storage. */
  loadModel(modelPath: string, options: MobileModelOptions): Promise<void>;

  /** Generate text from a prompt. Returns an async iterable of tokens for streaming. */
  generate(prompt: string, options: MobileGenerateOptions): AsyncIterable<string>;

  /** Generate embeddings for a text input. Returns a float array. */
  embed(text: string): Promise<number[]>;

  /** Unload the currently loaded model to free memory. */
  unloadModel(): Promise<void>;

  /** Check if a model is currently loaded and ready for inference. */
  isModelLoaded(): boolean;

  /** Get current memory usage information. */
  getMemoryUsage(): Promise<MobileMemoryInfo>;

  /** Get the platform this bridge is running on. */
  getPlatform(): MobilePlatform;
}

export type MobilePlatform = 'ios' | 'android';

export interface MobileModelOptions {
  /** Context length in tokens. Default: 2048 for mobile. */
  contextLength: number;
  /** Batch size for prompt processing. Default: 32 for mobile. */
  batchSize: number;
  /** Number of CPU threads to use. 0 = auto-detect. */
  threads: number;
  /** Number of GPU layers to offload. iOS: Metal layers. Android: Vulkan if available. */
  gpuLayers?: number;
}

export interface MobileGenerateOptions {
  /** Maximum number of tokens to generate. Default: 512. */
  maxTokens?: number;
  /** Temperature for sampling. Default: 0.7. */
  temperature?: number;
  /** Stop sequences. */
  stop?: string[];
  /** System prompt to prepend. */
  systemPrompt?: string;
}

export interface MobileMemoryInfo {
  /** Memory used by the model in bytes. */
  used: number;
  /** Available memory in bytes. */
  available: number;
}

/**
 * Default mobile model options by device tier.
 */
export const MOBILE_MODEL_DEFAULTS = {
  capable: {
    contextLength: 2048,
    batchSize: 32,
    threads: 0, // auto-detect
    gpuLayers: 32, // Offload most layers to GPU
  },
  constrained: {
    contextLength: 1024,
    batchSize: 16,
    threads: 0,
    gpuLayers: 16, // Fewer GPU layers on constrained devices
  },
} as const satisfies Record<string, MobileModelOptions>;

/**
 * Mobile model tier — determines which model to download and run.
 */
export type MobileModelTier = 'capable' | 'constrained' | 'none';

/**
 * Mobile device classification result.
 */
export interface MobileDeviceProfile {
  tier: MobileModelTier;
  platform: MobilePlatform;
  ramMb: number;
  chipName: string;
  /** Recommended model: '3B' for capable, '1.5B' for constrained, null for none. */
  recommendedModelSize: '3B' | '1.5B' | null;
  /** Whether the device supports GPU acceleration. */
  gpuAcceleration: boolean;
  /** Model options tuned for this device. */
  modelOptions: MobileModelOptions;
}

/**
 * Classify a mobile device into a tier based on RAM and platform.
 * - capable: 6GB+ RAM → 3B parameter models (e.g., Llama 3.2 3B Q4_K_M)
 * - constrained: 4GB RAM → 1.5B parameter models (e.g., Qwen 2.5 1.5B Q4_K_M)
 * - none: <4GB RAM → inference not available, use task routing to desktop
 */
export function classifyMobileDevice(
  platform: MobilePlatform,
  ramMb: number,
  chipName: string,
): MobileDeviceProfile {
  const ramGb = ramMb / 1024;

  if (ramGb >= 6) {
    return {
      tier: 'capable',
      platform,
      ramMb,
      chipName,
      recommendedModelSize: '3B',
      gpuAcceleration: true,
      modelOptions: { ...MOBILE_MODEL_DEFAULTS.capable },
    };
  }

  if (ramGb >= 4) {
    return {
      tier: 'constrained',
      platform,
      ramMb,
      chipName,
      recommendedModelSize: '1.5B',
      gpuAcceleration: platform === 'ios', // Metal always available on iOS; Vulkan optional on Android
      modelOptions: { ...MOBILE_MODEL_DEFAULTS.constrained },
    };
  }

  return {
    tier: 'none',
    platform,
    ramMb,
    chipName,
    recommendedModelSize: null,
    gpuAcceleration: false,
    modelOptions: { ...MOBILE_MODEL_DEFAULTS.constrained },
  };
}

/**
 * Describe a mobile device profile in plain language for onboarding.
 */
export function describeMobileProfile(profile: MobileDeviceProfile): string {
  const ramGb = Math.round(profile.ramMb / 1024);
  const gpu = profile.gpuAcceleration ? 'GPU acceleration available' : 'CPU-only inference';

  switch (profile.tier) {
    case 'capable':
      return `${profile.chipName}, ${ramGb}GB RAM, ${gpu} — Full on-device AI (3B model)`;
    case 'constrained':
      return `${profile.chipName}, ${ramGb}GB RAM, ${gpu} — Basic on-device AI (1.5B model)`;
    case 'none':
      return `${profile.chipName}, ${ramGb}GB RAM — AI features require desktop connection`;
  }
}

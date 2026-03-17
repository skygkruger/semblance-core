// LLM Integration Layer — Export provider interface, Ollama, and native runtime types.

export type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatMessage,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
  ToolDefinition,
  ToolCall,
} from './types.js';

export { OllamaProvider } from './ollama-provider.js';
export { ModelManager } from './model-manager.js';
export type { ModelRecommendation } from './model-manager.js';

// Hardware detection and model catalog
export type { HardwareProfile, HardwareProfileTier, GpuInfo } from './hardware-types.js';
export { classifyHardware, describeTier, describeProfile } from './hardware-types.js';
export type { ModelRegistryEntry, ResidencyPolicy } from './model-registry.js';
export {
  MODEL_CATALOG,
  BITNET_MODEL_CATALOG,
  getRecommendedReasoningModel,
  getEmbeddingModel,
  getFastTierModel,
  getModelsForTier,
  getModelById,
  getTotalDownloadSize,
  formatBytes,
  getBitNetModels,
  getBitNetModelsForTier,
  getRecommendedBitNetModel,
  getAllReasoningModelsForTier,
  getAnyModelById,
  getVisionModelsForTier,
  getRecommendedVisionModel,
  getRichVisionModel,
} from './model-registry.js';

// Model residency management
export { ModelResidencyManager } from './model-residency.js';

// Native provider (llama.cpp via Rust FFI bridge)
export { NativeProvider } from './native-provider.js';
export type {
  NativeRuntimeBridge,
  NativeBridgeGenerateParams,
  NativeBridgeGenerateResult,
  NativeBridgeEmbedParams,
  NativeBridgeEmbedResult,
  NativeBridgeStatus,
} from './native-bridge-types.js';

// BitNet provider (1-bit quantized models via CPU-optimized inference)
export { BitNetProvider } from './bitnet-provider.js';
export type { BitNetProviderConfig } from './bitnet-provider.js';

// Inference routing
export { InferenceRouter } from './inference-router.js';
export type { InferenceRouterConfig } from './inference-router.js';
export type { TaskType, InferenceTier, InferenceRequest } from './inference-types.js';
export { TASK_TIER_MAP, TIER_FALLBACK_CHAIN } from './inference-types.js';

import type { LLMProvider } from './types.js';
import { OllamaProvider } from './ollama-provider.js';
import { InferenceRouter } from './inference-router.js';
import type { NativeRuntimeBridge } from './native-bridge-types.js';
import { NativeProvider } from './native-provider.js';
import { BitNetProvider } from './bitnet-provider.js';

export interface CreateLLMProviderConfig {
  /** Runtime mode: 'ollama' uses OllamaProvider, 'builtin' uses NativeProvider, 'bitnet' uses BitNetProvider. Default: 'ollama'. */
  runtime?: 'ollama' | 'builtin' | 'bitnet' | 'custom';
  /** Ollama base URL. Only used when runtime is 'ollama'. */
  baseUrl?: string;
  /** NativeRuntimeBridge implementation. Required when runtime is 'builtin' or 'bitnet'. */
  nativeBridge?: NativeRuntimeBridge;
  /** Reasoning model name. Defaults to 'llama3.2:8b' for Ollama, 'native' for builtin, 'falcon-e-1b' for bitnet. */
  reasoningModel?: string;
  /** Embedding model name. Defaults to 'nomic-embed-text'. */
  embeddingModel?: string;
  /** BitNet bridge (same NativeRuntimeBridge — one-fork approach). Used to create a BitNet fallback alongside the primary provider. */
  bitnetBridge?: NativeRuntimeBridge;
  /** BitNet model name. Only used when bitnetBridge is provided. */
  bitnetModel?: string;
}

/**
 * Create an LLM provider wrapped in InferenceRouter.
 *
 * All callers receive an InferenceRouter (which implements LLMProvider).
 * The router delegates to the underlying provider based on task type.
 * This is the ONLY factory that should be used to create LLM providers.
 *
 * Provider priority (desktop): Ollama (GPU) > BitNet (CPU) > Native (fallback).
 * When bitnetBridge is provided alongside the primary provider, BitNet is
 * registered as the fallback reasoning provider in the router.
 */
export function createLLMProvider(config?: CreateLLMProviderConfig | { baseUrl?: string }): LLMProvider {
  // Backward compatibility: plain { baseUrl } config → Ollama mode
  const runtime = (config && 'runtime' in config) ? config.runtime : 'ollama';
  const baseUrl = (config && 'baseUrl' in config) ? config.baseUrl : undefined;
  const nativeBridge = (config && 'nativeBridge' in config) ? config.nativeBridge : undefined;
  const reasoningModel = (config && 'reasoningModel' in config) ? config.reasoningModel : undefined;
  const embeddingModel = (config && 'embeddingModel' in config) ? config.embeddingModel : 'nomic-embed-text';
  const bitnetBridge = (config && 'bitnetBridge' in config) ? config.bitnetBridge : undefined;
  const bitnetModel = (config && 'bitnetModel' in config) ? config.bitnetModel : 'falcon-e-1b';

  let provider: LLMProvider;

  if (runtime === 'bitnet' && nativeBridge) {
    // BitNet as primary provider (no Ollama available)
    provider = new BitNetProvider({
      bridge: nativeBridge,
      modelName: reasoningModel ?? 'falcon-e-1b',
      embeddingModelName: embeddingModel,
    });
  } else if (runtime === 'builtin' && nativeBridge) {
    provider = new NativeProvider({
      bridge: nativeBridge,
      modelName: reasoningModel ?? 'native',
      embeddingModelName: embeddingModel,
    });
  } else {
    // Default: Ollama provider (localhost-only)
    provider = new OllamaProvider({ baseUrl });
  }

  // Create BitNet fallback provider if a separate bitnet bridge is provided
  // This allows Ollama > BitNet > Native priority chain
  let bitnetProvider: LLMProvider | undefined;
  if (bitnetBridge && runtime !== 'bitnet') {
    bitnetProvider = new BitNetProvider({
      bridge: bitnetBridge,
      modelName: bitnetModel ?? 'falcon-e-1b',
      embeddingModelName: embeddingModel,
    });
  }

  // Wrap in InferenceRouter so all callers go through routing
  return new InferenceRouter({
    reasoningProvider: provider,
    embeddingProvider: provider,
    reasoningModel: reasoningModel ?? 'llama3.1:8b',
    embeddingModel: embeddingModel ?? 'nomic-embed-text',
    bitnetProvider,
    bitnetReasoningModel: bitnetProvider ? (bitnetModel ?? 'falcon-e-1b') : undefined,
  });
}

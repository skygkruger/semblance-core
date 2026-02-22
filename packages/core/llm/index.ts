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
export type { ModelRegistryEntry } from './model-registry.js';
export {
  MODEL_CATALOG,
  getRecommendedReasoningModel,
  getEmbeddingModel,
  getModelsForTier,
  getModelById,
  getTotalDownloadSize,
  formatBytes,
} from './model-registry.js';

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

export interface CreateLLMProviderConfig {
  /** Runtime mode: 'ollama' uses OllamaProvider, 'builtin' uses NativeProvider. Default: 'ollama'. */
  runtime?: 'ollama' | 'builtin' | 'custom';
  /** Ollama base URL. Only used when runtime is 'ollama'. */
  baseUrl?: string;
  /** NativeRuntimeBridge implementation. Required when runtime is 'builtin'. */
  nativeBridge?: NativeRuntimeBridge;
  /** Reasoning model name. Defaults to 'llama3.2:8b' for Ollama, 'native' for builtin. */
  reasoningModel?: string;
  /** Embedding model name. Defaults to 'nomic-embed-text'. */
  embeddingModel?: string;
}

/**
 * Create an LLM provider wrapped in InferenceRouter.
 *
 * All callers receive an InferenceRouter (which implements LLMProvider).
 * The router delegates to the underlying provider based on task type.
 * This is the ONLY factory that should be used to create LLM providers.
 */
export function createLLMProvider(config?: CreateLLMProviderConfig | { baseUrl?: string }): LLMProvider {
  // Backward compatibility: plain { baseUrl } config → Ollama mode
  const runtime = (config && 'runtime' in config) ? config.runtime : 'ollama';
  const baseUrl = (config && 'baseUrl' in config) ? config.baseUrl : undefined;
  const nativeBridge = (config && 'nativeBridge' in config) ? config.nativeBridge : undefined;
  const reasoningModel = (config && 'reasoningModel' in config) ? config.reasoningModel : undefined;
  const embeddingModel = (config && 'embeddingModel' in config) ? config.embeddingModel : 'nomic-embed-text';

  let provider: LLMProvider;

  if (runtime === 'builtin' && nativeBridge) {
    provider = new NativeProvider({
      bridge: nativeBridge,
      modelName: reasoningModel ?? 'native',
      embeddingModelName: embeddingModel,
    });
  } else {
    // Default: Ollama provider (localhost-only)
    provider = new OllamaProvider({ baseUrl });
  }

  // Wrap in InferenceRouter so all callers go through routing
  return new InferenceRouter({
    reasoningProvider: provider,
    embeddingProvider: provider,
    reasoningModel: reasoningModel ?? 'llama3.2:8b',
    embeddingModel: embeddingModel ?? 'nomic-embed-text',
  });
}

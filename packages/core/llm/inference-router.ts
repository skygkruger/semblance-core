// InferenceRouter — Routes inference requests to the appropriate provider/tier.
//
// Implements LLMProvider so it's a drop-in replacement for any code that uses LLMProvider.
// Routes by TaskType → InferenceTier → provider selection with fallback chains.
//
// Three-tier architecture:
//   - Fast tier (SmolLM2): always-resident, handles classify/extract
//   - Primary tier (Qwen3): session-resident, handles generate/reason/draft
//   - Vision tier (Moondream2/Qwen2.5-VL): on-demand vision-language tasks
//
// CRITICAL: This file is in packages/core/. No network imports. No platform imports.

import type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
} from './types.js';
import type { TaskType, InferenceTier } from './inference-types.js';
import { TASK_TIER_MAP, TIER_FALLBACK_CHAIN } from './inference-types.js';
import type { ModelRegistryEntry } from './model-registry.js';

export type InferencePlatform = 'desktop' | 'ios' | 'android';

export interface InferenceRouterConfig {
  /** Provider for fast/primary/quality tier reasoning (typically the same in Step 9) */
  reasoningProvider: LLMProvider;
  /** Provider for embedding tier (may be the same instance or dedicated) */
  embeddingProvider: LLMProvider;
  /** Model name for reasoning tasks */
  reasoningModel: string;
  /** Model name for embedding tasks */
  embeddingModel: string;
  /** Platform this router is running on. Default: 'desktop'. */
  platform?: InferencePlatform;
  /** Mobile-specific provider (used when platform is 'ios' or 'android'). */
  mobileProvider?: LLMProvider;
  /** Mobile reasoning model name. */
  mobileReasoningModel?: string;
  /** Mobile embedding model name. */
  mobileEmbeddingModel?: string;
  /** BitNet provider for CPU-optimized 1-bit inference. Slots between Ollama and Native. */
  bitnetProvider?: LLMProvider;
  /** BitNet reasoning model name. */
  bitnetReasoningModel?: string;
  /** Fast tier provider (SmolLM2) — always-resident classification model. */
  fastProvider?: LLMProvider;
  /** Fast tier model name. */
  fastModel?: string;
  /** Vision provider (Moondream2 or Qwen2.5-VL). */
  visionProvider?: LLMProvider;
  /** Vision model name for fast vision tasks (Moondream2). */
  visionFastModel?: string;
  /** Vision model name for rich vision tasks (Qwen2.5-VL). */
  visionRichModel?: string;
}

/**
 * InferenceRouter routes requests to the appropriate LLM provider based on task type.
 *
 * It implements the LLMProvider interface so callers don't need to know about routing.
 * For the standard LLMProvider methods (generate/chat/embed), it uses sensible defaults.
 * For task-aware routing, callers can use the explicit `routedChat()` / `routedGenerate()`.
 */
export class InferenceRouter implements LLMProvider {
  private reasoningProvider: LLMProvider;
  private embeddingProvider: LLMProvider;
  private reasoningModel: string;
  private embeddingModel: string;
  private platform: InferencePlatform;
  private mobileProvider: LLMProvider | null;
  private mobileReasoningModel: string | null;
  private mobileEmbeddingModel: string | null;
  private bitnetProvider: LLMProvider | null;
  private bitnetReasoningModel: string | null;
  private fastProvider: LLMProvider | null;
  private fastModel: string | null;
  private visionProvider: LLMProvider | null;
  private visionFastModel: string | null;
  private visionRichModel: string | null;

  constructor(config: InferenceRouterConfig) {
    this.reasoningProvider = config.reasoningProvider;
    this.embeddingProvider = config.embeddingProvider;
    this.reasoningModel = config.reasoningModel;
    this.embeddingModel = config.embeddingModel;
    this.platform = config.platform ?? 'desktop';
    this.mobileProvider = config.mobileProvider ?? null;
    this.mobileReasoningModel = config.mobileReasoningModel ?? null;
    this.mobileEmbeddingModel = config.mobileEmbeddingModel ?? null;
    this.bitnetProvider = config.bitnetProvider ?? null;
    this.bitnetReasoningModel = config.bitnetReasoningModel ?? null;
    this.fastProvider = config.fastProvider ?? null;
    this.fastModel = config.fastModel ?? null;
    this.visionProvider = config.visionProvider ?? null;
    this.visionFastModel = config.visionFastModel ?? null;
    this.visionRichModel = config.visionRichModel ?? null;
  }

  // ─── LLMProvider Interface ───────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    // Available if at least one provider is available
    const [reasoning, embedding] = await Promise.all([
      this.reasoningProvider.isAvailable().catch(() => false),
      this.embeddingProvider.isAvailable().catch(() => false),
    ]);
    return reasoning || embedding;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const provider = this.getProviderForTier('primary');
    return provider.generate({
      ...request,
      model: request.model || this.reasoningModel,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const provider = this.getProviderForTier('primary');
    return provider.chat({
      ...request,
      model: request.model || this.reasoningModel,
    });
  }

  async *chatStream(request: ChatRequest): AsyncIterable<string> {
    const provider = this.getProviderForTier('primary');
    if (provider.chatStream) {
      yield* provider.chatStream({
        ...request,
        model: request.model || this.reasoningModel,
      });
    } else {
      // Fallback: non-streaming
      const response = await provider.chat({
        ...request,
        model: request.model || this.reasoningModel,
      });
      yield response.message.content;
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    return this.embeddingProvider.embed({
      ...request,
      model: request.model || this.embeddingModel,
    });
  }

  async listModels(): Promise<ModelInfo[]> {
    const [reasoning, embedding] = await Promise.all([
      this.reasoningProvider.listModels().catch(() => [] as ModelInfo[]),
      this.embeddingProvider.listModels().catch(() => [] as ModelInfo[]),
    ]);

    // Deduplicate by name (providers may be the same instance)
    const seen = new Set<string>();
    const models: ModelInfo[] = [];
    for (const model of [...reasoning, ...embedding]) {
      if (!seen.has(model.name)) {
        seen.add(model.name);
        models.push(model);
      }
    }
    return models;
  }

  async getModel(name: string): Promise<ModelInfo | null> {
    const result = await this.reasoningProvider.getModel(name);
    if (result) return result;
    return this.embeddingProvider.getModel(name);
  }

  // ─── Task-Aware Routing ───────────────────────────────────────────────────

  /**
   * Route a chat request based on task type.
   * Uses TASK_TIER_MAP to select the appropriate tier, with fallback.
   */
  async routedChat(request: ChatRequest, taskType: TaskType): Promise<ChatResponse> {
    const tier = TASK_TIER_MAP[taskType];
    const { provider, model } = this.resolveProviderAndModel(tier, taskType);
    return provider.chat({
      ...request,
      model: request.model || model,
    });
  }

  /**
   * Route a generate request based on task type.
   */
  async routedGenerate(request: GenerateRequest, taskType: TaskType): Promise<GenerateResponse> {
    const tier = TASK_TIER_MAP[taskType];
    const { provider, model } = this.resolveProviderAndModel(tier, taskType);
    return provider.generate({
      ...request,
      model: request.model || model,
    });
  }

  /**
   * Route by tier directly. Used by the orchestrator when it knows the task type.
   * Returns the model registry entry that should handle this task.
   */
  routeByTier(taskType: TaskType): { tier: InferenceTier; modelName: string } {
    const tier = TASK_TIER_MAP[taskType];
    const { model } = this.resolveProviderAndModel(tier, taskType);
    return { tier, modelName: model };
  }

  /**
   * Get the model name used for a specific task type.
   */
  getModelForTask(taskType: TaskType): string {
    if (taskType === 'embed') return this.embeddingModel;
    const { model } = this.resolveProviderAndModel(TASK_TIER_MAP[taskType], taskType);
    return model;
  }

  /**
   * Get the active reasoning model name.
   */
  getReasoningModel(): string {
    return this.reasoningModel;
  }

  /**
   * Get the active embedding model name.
   */
  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  /**
   * Get the fast tier model name, or null if not configured.
   */
  getFastModel(): string | null {
    return this.fastModel;
  }

  /**
   * Update the reasoning provider (e.g., when switching between Ollama and native).
   */
  setReasoningProvider(provider: LLMProvider, model: string): void {
    this.reasoningProvider = provider;
    this.reasoningModel = model;
    // When a higher-priority provider (e.g. Ollama GPU) is set as reasoning provider,
    // clear the BitNet CPU provider so getProviderForTier() doesn't bypass it.
    // Priority: Ollama (GPU) > BitNet (CPU) > Native (fallback).
    this.bitnetProvider = null;
    this.bitnetReasoningModel = null;
  }

  /**
   * Update the embedding provider.
   */
  setEmbeddingProvider(provider: LLMProvider, model: string): void {
    this.embeddingProvider = provider;
    this.embeddingModel = model;
  }

  /**
   * Set or update the mobile provider (used when platform is 'ios' or 'android').
   */
  setMobileProvider(provider: LLMProvider, reasoningModel: string, embeddingModel: string): void {
    this.mobileProvider = provider;
    this.mobileReasoningModel = reasoningModel;
    this.mobileEmbeddingModel = embeddingModel;
  }

  /**
   * Set or update the BitNet provider (CPU-optimized 1-bit inference).
   * BitNet acts as the primary reasoning provider when no GPU provider (Ollama) is active.
   * When Ollama is available, call clearBitNetProvider() so the GPU path is used instead.
   */
  setBitNetProvider(provider: LLMProvider, model: string): void {
    this.bitnetProvider = provider;
    this.bitnetReasoningModel = model;
  }

  /**
   * Clear the BitNet provider (e.g., when Ollama GPU inference becomes available).
   * Requests will fall through to the reasoning provider instead.
   */
  clearBitNetProvider(): void {
    this.bitnetProvider = null;
    this.bitnetReasoningModel = null;
  }

  /**
   * Set or update the fast tier provider (SmolLM2).
   * The fast tier handles classify/extract tasks and is always-resident.
   */
  setFastProvider(provider: LLMProvider, model: string): void {
    this.fastProvider = provider;
    this.fastModel = model;
  }

  /**
   * Set or update the vision provider.
   */
  setVisionProvider(provider: LLMProvider, fastModel: string, richModel?: string): void {
    this.visionProvider = provider;
    this.visionFastModel = fastModel;
    this.visionRichModel = richModel ?? null;
  }

  /**
   * Check if the BitNet provider is available and ready.
   */
  async isBitNetReady(): Promise<boolean> {
    if (!this.bitnetProvider) return false;
    return this.bitnetProvider.isAvailable();
  }

  /**
   * Get the active BitNet model name, or null if BitNet is not configured.
   */
  getBitNetModel(): string | null {
    return this.bitnetReasoningModel;
  }

  /**
   * Check if the fast tier is ready (SmolLM2 loaded).
   */
  isFastTierReady(): boolean {
    return this.fastProvider !== null && this.fastModel !== null;
  }

  /**
   * Check if vision inference is available.
   */
  isVisionReady(): boolean {
    return this.visionProvider !== null && this.visionFastModel !== null;
  }

  /**
   * Get the current platform.
   */
  getPlatform(): InferencePlatform {
    return this.platform;
  }

  /**
   * Check if this router is running on a mobile platform.
   */
  isMobile(): boolean {
    return this.platform === 'ios' || this.platform === 'android';
  }

  /**
   * Check if the mobile provider is available and ready.
   */
  async isMobileReady(): Promise<boolean> {
    if (!this.mobileProvider) return false;
    return this.mobileProvider.isAvailable();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Resolve the provider and model name for a given tier and task type.
   */
  private resolveProviderAndModel(tier: InferenceTier, taskType?: TaskType): { provider: LLMProvider; model: string } {
    if (this.isMobile() && this.mobileProvider) {
      return { provider: this.mobileProvider, model: this.mobileReasoningModel ?? this.reasoningModel };
    }

    // Fast tier: use dedicated fast provider if available
    if (tier === 'fast' && this.fastProvider && this.fastModel) {
      return { provider: this.fastProvider, model: this.fastModel };
    }

    // Vision tier: route to vision provider
    if (tier === 'vision' && this.visionProvider) {
      const model = (taskType === 'vision_rich' && this.visionRichModel)
        ? this.visionRichModel
        : (this.visionFastModel ?? this.reasoningModel);
      return { provider: this.visionProvider, model };
    }

    // Embedding tier
    if (tier === 'embedding') {
      return { provider: this.embeddingProvider, model: this.embeddingModel };
    }

    // Primary/Quality tier: BitNet > reasoning provider
    if (this.bitnetProvider) {
      return { provider: this.bitnetProvider, model: this.bitnetReasoningModel ?? this.reasoningModel };
    }

    return { provider: this.reasoningProvider, model: this.reasoningModel };
  }

  /**
   * Get the provider for a given inference tier (legacy compatibility).
   */
  private getProviderForTier(tier: InferenceTier): LLMProvider {
    return this.resolveProviderAndModel(tier).provider;
  }
}

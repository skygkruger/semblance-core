// InferenceRouter — Routes inference requests to the appropriate provider/tier.
//
// Implements LLMProvider so it's a drop-in replacement for any code that uses LLMProvider.
// Routes by TaskType → InferenceTier → provider selection with fallback chains.
//
// For Step 9: fast and primary tiers point to the same model (one reasoning model
// per hardware tier). The distinction exists for future multi-model setups.
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

export interface InferenceRouterConfig {
  /** Provider for fast/primary/quality tier reasoning (typically the same in Step 9) */
  reasoningProvider: LLMProvider;
  /** Provider for embedding tier (may be the same instance or dedicated) */
  embeddingProvider: LLMProvider;
  /** Model name for reasoning tasks */
  reasoningModel: string;
  /** Model name for embedding tasks */
  embeddingModel: string;
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

  constructor(config: InferenceRouterConfig) {
    this.reasoningProvider = config.reasoningProvider;
    this.embeddingProvider = config.embeddingProvider;
    this.reasoningModel = config.reasoningModel;
    this.embeddingModel = config.embeddingModel;
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
    const provider = this.getProviderForTier(tier);
    return provider.chat({
      ...request,
      model: request.model || this.reasoningModel,
    });
  }

  /**
   * Route a generate request based on task type.
   */
  async routedGenerate(request: GenerateRequest, taskType: TaskType): Promise<GenerateResponse> {
    const tier = TASK_TIER_MAP[taskType];
    const provider = this.getProviderForTier(tier);
    return provider.generate({
      ...request,
      model: request.model || this.reasoningModel,
    });
  }

  /**
   * Get the model name used for a specific task type.
   */
  getModelForTask(taskType: TaskType): string {
    if (taskType === 'embed') return this.embeddingModel;
    return this.reasoningModel;
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
   * Update the reasoning provider (e.g., when switching between Ollama and native).
   */
  setReasoningProvider(provider: LLMProvider, model: string): void {
    this.reasoningProvider = provider;
    this.reasoningModel = model;
  }

  /**
   * Update the embedding provider.
   */
  setEmbeddingProvider(provider: LLMProvider, model: string): void {
    this.embeddingProvider = provider;
    this.embeddingModel = model;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Get the provider for a given inference tier.
   * For Step 9, all reasoning tiers (fast/primary/quality) use the same provider.
   * Embedding tier uses the embedding provider.
   */
  private getProviderForTier(tier: InferenceTier): LLMProvider {
    if (tier === 'embedding') {
      return this.embeddingProvider;
    }
    // For Step 9, all reasoning tiers use the same provider.
    // Future: different models for fast vs quality tiers.
    return this.reasoningProvider;
  }
}

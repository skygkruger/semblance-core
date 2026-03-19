// FastNativeProvider — Routes inference to the fast-tier model (SmolLM2) via NativeRuntimeBridge.
// Implements LLMProvider so it can be plugged into InferenceRouter.setFastProvider().
// Used for classify/extract tasks — short outputs, low temperature, always-resident.
// CRITICAL: packages/core/, no network imports.

import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  GenerateRequest,
  GenerateResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
} from './types.js';
import type { NativeRuntimeBridge } from './native-bridge-types.js';

export class FastNativeProvider implements LLMProvider {
  private bridge: NativeRuntimeBridge;
  private modelName: string;

  constructor(config: { bridge: NativeRuntimeBridge; modelName: string }) {
    this.bridge = config.bridge;
    this.modelName = config.modelName;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.bridge.getStatus();
      return !!status.fastModel;
    } catch {
      return false;
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    if (!this.bridge.generateFast) {
      throw new Error('Fast generation not supported by this bridge');
    }
    const result = await this.bridge.generateFast({
      prompt: request.prompt,
      systemPrompt: request.system,
      maxTokens: request.maxTokens ?? 256,
      temperature: request.temperature ?? 0.3,
      stop: request.stop,
    });
    return {
      text: result.text,
      model: this.modelName,
      tokensUsed: { prompt: 0, completion: result.tokensGenerated, total: result.tokensGenerated },
      durationMs: result.durationMs,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.bridge.generateFast) {
      throw new Error('Fast generation not supported by this bridge');
    }
    // Build prompt from messages — fast tier uses simple prompt construction
    const systemMsg = request.messages.find(m => m.role === 'system');
    const lastUser = request.messages.filter(m => m.role === 'user').pop();
    const prompt = lastUser?.content ?? '';

    const result = await this.bridge.generateFast({
      prompt,
      systemPrompt: systemMsg?.content,
      maxTokens: request.maxTokens ?? 256,
      temperature: request.temperature ?? 0.3,
      stop: request.stop,
    });

    return {
      message: { role: 'assistant', content: result.text },
      model: this.modelName,
      tokensUsed: { prompt: 0, completion: result.tokensGenerated, total: result.tokensGenerated },
      durationMs: result.durationMs,
    };
  }

  async embed(_request: EmbedRequest): Promise<EmbedResponse> {
    throw new Error('FastNativeProvider does not support embeddings — use the embedding provider');
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ name: this.modelName, size: 0, isEmbedding: false }];
  }

  async getModel(name: string): Promise<ModelInfo | null> {
    if (name === this.modelName) return { name, size: 0, isEmbedding: false };
    return null;
  }
}

// MobileProvider — LLMProvider implementation backed by MobileInferenceBridge.
//
// Wraps either MLXBridge (iOS) or LlamaCppBridge (Android) into the standard
// LLMProvider interface so the InferenceRouter can use it transparently.
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
import type { MobileInferenceBridge } from './mobile-bridge-types.js';

export class MobileProvider implements LLMProvider {
  private bridge: MobileInferenceBridge;
  private modelName: string;
  private embeddingModelName: string;

  constructor(config: {
    bridge: MobileInferenceBridge;
    modelName?: string;
    embeddingModelName?: string;
  }) {
    this.bridge = config.bridge;
    this.modelName = config.modelName ?? 'mobile-native';
    this.embeddingModelName = config.embeddingModelName ?? 'nomic-embed-text-v1.5-384';
  }

  async isAvailable(): Promise<boolean> {
    return this.bridge.isModelLoaded();
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const tokens: string[] = [];
    const start = Date.now();

    for await (const token of this.bridge.generate(request.prompt, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
      systemPrompt: request.system,
    })) {
      tokens.push(token);
    }

    const text = tokens.join('');
    const durationMs = Date.now() - start;

    return {
      text,
      model: request.model || this.modelName,
      tokensUsed: {
        prompt: 0,
        completion: tokens.length,
        total: tokens.length,
      },
      durationMs,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const prompt = this.formatChatPrompt(request.messages);
    const tokens: string[] = [];
    const start = Date.now();

    for await (const token of this.bridge.generate(prompt, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
    })) {
      tokens.push(token);
    }

    const text = tokens.join('');
    const durationMs = Date.now() - start;

    return {
      message: {
        role: 'assistant',
        content: text,
      },
      model: request.model || this.modelName,
      tokensUsed: {
        prompt: 0,
        completion: tokens.length,
        total: tokens.length,
      },
      durationMs,
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<string> {
    const prompt = this.formatChatPrompt(request.messages);

    for await (const token of this.bridge.generate(prompt, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
    })) {
      yield token;
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const input = Array.isArray(request.input) ? request.input : [request.input];
    const start = Date.now();

    const embeddings: number[][] = [];
    for (const text of input) {
      const embedding = await this.bridge.embed(text);
      embeddings.push(embedding);
    }

    return {
      embeddings,
      model: request.model || this.embeddingModelName,
      durationMs: Date.now() - start,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];

    if (this.bridge.isModelLoaded()) {
      models.push({
        name: this.modelName,
        size: 0,
        isEmbedding: false,
        family: `mobile-${this.bridge.getPlatform()}`,
      });
      models.push({
        name: this.embeddingModelName,
        size: 0,
        isEmbedding: true,
        family: `mobile-${this.bridge.getPlatform()}`,
      });
    }

    return models;
  }

  async getModel(name: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models.find(m => m.name === name) ?? null;
  }

  /**
   * Format chat messages into a single prompt string.
   * Uses a simple template compatible with most instruction-tuned models.
   */
  private formatChatPrompt(messages: Array<{ role: string; content: string }>): string {
    const parts: string[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case 'system':
          parts.push(`<|system|>\n${msg.content}\n`);
          break;
        case 'user':
          parts.push(`<|user|>\n${msg.content}\n`);
          break;
        case 'assistant':
          parts.push(`<|assistant|>\n${msg.content}\n`);
          break;
      }
    }

    parts.push('<|assistant|>\n');
    return parts.join('');
  }
}

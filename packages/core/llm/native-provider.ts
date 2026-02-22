// NativeProvider — LLMProvider implementation backed by llama.cpp via Rust FFI.
//
// Uses dependency injection: accepts a NativeRuntimeBridge interface in constructor.
// The bridge implementation is provided by the desktop app (which calls through
// to Rust NativeRuntime via NDJSON callbacks). This keeps packages/core/ free of
// Tauri/platform imports.
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
import type { NativeRuntimeBridge } from './native-bridge-types.js';

export class NativeProvider implements LLMProvider {
  private bridge: NativeRuntimeBridge;
  private modelName: string;
  private embeddingModelName: string;

  constructor(config: {
    bridge: NativeRuntimeBridge;
    modelName?: string;
    embeddingModelName?: string;
  }) {
    this.bridge = config.bridge;
    this.modelName = config.modelName ?? 'native';
    this.embeddingModelName = config.embeddingModelName ?? 'nomic-embed-text-v1.5';
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.bridge.isReady();
    } catch {
      return false;
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const result = await this.bridge.generate({
      prompt: request.prompt,
      systemPrompt: request.system,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
    });

    return {
      text: result.text,
      model: request.model || this.modelName,
      tokensUsed: {
        prompt: 0, // Native runtime doesn't expose prompt token count yet
        completion: result.tokensGenerated,
        total: result.tokensGenerated,
      },
      durationMs: result.durationMs,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Convert chat messages to a single prompt for the native runtime
    const prompt = this.formatChatPrompt(request.messages);

    const result = await this.bridge.generate({
      prompt,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
    });

    return {
      message: {
        role: 'assistant',
        content: result.text,
      },
      model: request.model || this.modelName,
      tokensUsed: {
        prompt: 0,
        completion: result.tokensGenerated,
        total: result.tokensGenerated,
      },
      durationMs: result.durationMs,
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<string> {
    if (!this.bridge.generateStream) {
      // Fallback: non-streaming generate, yield entire response at once
      const response = await this.chat(request);
      yield response.message.content;
      return;
    }

    const prompt = this.formatChatPrompt(request.messages);
    const stream = this.bridge.generateStream({
      prompt,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
    });

    for await (const token of stream) {
      yield token;
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const input = Array.isArray(request.input) ? request.input : [request.input];

    const result = await this.bridge.embed({ input });

    return {
      embeddings: result.embeddings,
      model: request.model || this.embeddingModelName,
      durationMs: result.durationMs,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const status = await this.bridge.getStatus();
    const models: ModelInfo[] = [];

    if (status.reasoningModel) {
      models.push({
        name: status.reasoningModel,
        size: 0,
        isEmbedding: false,
        family: 'native',
      });
    }

    if (status.embeddingModel) {
      models.push({
        name: status.embeddingModel,
        size: 0,
        isEmbedding: true,
        family: 'native',
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

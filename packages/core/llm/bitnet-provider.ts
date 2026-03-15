// BitNetProvider — LLMProvider implementation for 1-bit quantized models via BitNet.cpp.
//
// Uses NativeRuntimeBridge to communicate with the Rust NativeRuntime, which compiles
// BitNet.cpp (Microsoft's llama.cpp fork with optimized i2_s/TL1/TL2 kernels) from
// source via the bitnet-sys crate. BitNet i2_s GGUFs get the optimized MAD kernels
// automatically. Standard GGUF models (Q4_K_M, Q8_0) also load normally since
// BitNet.cpp is a superset of llama.cpp.
//
// Compared to NativeProvider, BitNetProvider adds:
//   - Tool-calling support (XML <tool_call> block injection + parsing)
//   - Chat prompt formatting with <|system|>/<|user|>/<|assistant|> markers
//   - BitNet model identification in the InferenceRouter
//
// Design: Slots into InferenceRouter alongside OllamaProvider and NativeProvider.
// Selected when Ollama is not available and a BitNet model is downloaded.
// Priority: Ollama (GPU) > BitNet (CPU) > Native (fallback).
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
  ToolDefinition,
  ToolCall,
} from './types.js';
import type { NativeRuntimeBridge } from './native-bridge-types.js';

export interface BitNetProviderConfig {
  /** Bridge to the native runtime (same interface as NativeProvider). */
  bridge: NativeRuntimeBridge;
  /** Active BitNet model name (e.g., 'falcon-e-1b'). */
  modelName?: string;
  /** Embedding model name (shared with NativeProvider). */
  embeddingModelName?: string;
}

export class BitNetProvider implements LLMProvider {
  private bridge: NativeRuntimeBridge;
  private modelName: string;
  private embeddingModelName: string;

  constructor(config: BitNetProviderConfig) {
    this.bridge = config.bridge;
    this.modelName = config.modelName ?? 'falcon-e-1b';
    this.embeddingModelName = config.embeddingModelName ?? 'nomic-embed-text-v1.5';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const status = await this.bridge.getStatus();
      // Available if the bridge is ready and has a loaded model
      return status.status === 'ready' && status.reasoningModel !== null;
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
        prompt: 0,
        completion: result.tokensGenerated,
        total: result.tokensGenerated,
      },
      durationMs: result.durationMs,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // If tools are provided, inject them into the system prompt
    const messages = request.tools && request.tools.length > 0
      ? this.injectToolsIntoMessages(request.messages, request.tools)
      : request.messages;

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;

    // Build the prompt as plain user text. Do NOT add "Assistant:" prefixes —
    // native_runtime.rs wraps the prompt in ChatML (<|im_start|>user/assistant)
    // which handles role separation. Adding "Assistant:" causes double-formatting.
    const prompt = nonSystemMessages.map(m => m.content).join('\n\n');

    // Stop sequences for both ChatML (Qwen) and Falcon3 templates
    const stopSequences = [
      ...(request.stop ?? []),
      '<|im_end|>', '<|im_start|>',  // ChatML (Qwen)
      '<|user|>', '<|system|>', '<|endoftext|>',  // Falcon3
    ];

    const result = await this.bridge.generate({
      prompt,
      systemPrompt,
      maxTokens: request.maxTokens ?? 256,
      temperature: request.temperature,
      stop: stopSequences,
    });

    // Parse tool calls from the response if tools were requested
    let content = result.text;
    let toolCalls: ToolCall[] | undefined;

    if (request.tools && request.tools.length > 0) {
      const parsed = this.parseToolCalls(content);
      toolCalls = parsed.toolCalls.length > 0 ? parsed.toolCalls : undefined;
      content = parsed.textContent;
    }

    return {
      message: {
        role: 'assistant',
        content,
      },
      model: request.model || this.modelName,
      tokensUsed: {
        prompt: 0,
        completion: result.tokensGenerated,
        total: result.tokensGenerated,
      },
      durationMs: result.durationMs,
      toolCalls,
    };
  }

  async *chatStream(request: ChatRequest): AsyncIterable<string> {
    if (!this.bridge.generateStream) {
      const response = await this.chat(request);
      yield response.message.content;
      return;
    }

    // For streaming with tools, fall back to non-streaming so we can parse tool calls
    if (request.tools && request.tools.length > 0) {
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
        family: 'bitnet',
      });
    }

    if (status.embeddingModel) {
      models.push({
        name: status.embeddingModel,
        size: 0,
        isEmbedding: true,
        family: 'bitnet',
      });
    }

    return models;
  }

  async getModel(name: string): Promise<ModelInfo | null> {
    const models = await this.listModels();
    return models.find(m => m.name === name) ?? null;
  }

  /**
   * Get the currently active model name.
   */
  getModelName(): string {
    return this.modelName;
  }

  /**
   * Switch the active BitNet model. Triggers a model load on the bridge.
   */
  async switchModel(modelPath: string, modelName: string): Promise<void> {
    await this.bridge.loadModel(modelPath);
    this.modelName = modelName;
  }

  // ─── Tool Calling Support ───────────────────────────────────────────────────

  private injectToolsIntoMessages(
    messages: Array<{ role: string; content: string }>,
    tools: ToolDefinition[],
  ): Array<{ role: string; content: string }> {
    const toolBlock = this.formatToolDefinitions(tools);
    const result = [...messages];

    const systemIdx = result.findIndex(m => m.role === 'system');
    if (systemIdx >= 0) {
      const existing = result[systemIdx]!;
      result[systemIdx] = {
        role: existing.role,
        content: existing.content + '\n\n' + toolBlock,
      };
    } else {
      result.unshift({ role: 'system', content: toolBlock });
    }

    return result;
  }

  private formatToolDefinitions(tools: ToolDefinition[]): string {
    // Keep tool descriptions COMPACT for small models (10B, 2048 context).
    // Only list tool names + one-line description. No parameter details —
    // the model doesn't need them to decide WHICH tool to call.
    // Full parameter schemas are validated server-side anyway.
    const coreTools = tools.filter(t =>
      ['search_web', 'deep_search_web', 'fetch_url', 'fetch_inbox', 'search_emails',
       'send_email', 'draft_email', 'fetch_calendar', 'create_reminder',
       'search_knowledge', 'search_files'].includes(t.name)
    );
    const toolList = (coreTools.length > 0 ? coreTools : tools.slice(0, 10))
      .map(t => `- ${t.name}: ${t.description?.split('.')[0] ?? ''}`)
      .join('\n');

    return `You can use tools by outputting: <tool_call>{"name":"tool_name","arguments":{"key":"value"}}</tool_call>

Available: ${toolList}

Only use tools when needed. Answer from knowledge first.`;
  }

  private parseToolCalls(text: string): { toolCalls: ToolCall[]; textContent: string } {
    const toolCalls: ToolCall[] = [];
    let textContent = text;

    const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match;

    while ((match = toolCallRegex.exec(text)) !== null) {
      const jsonStr = (match[1] ?? '').trim();
      if (!jsonStr) continue;
      try {
        const parsed = JSON.parse(jsonStr) as { name?: string; arguments?: Record<string, unknown> };
        if (parsed.name && typeof parsed.name === 'string') {
          toolCalls.push({
            name: parsed.name,
            arguments: parsed.arguments ?? {},
          });
        }
      } catch {
        console.error('[BitNetProvider] Failed to parse tool call JSON:', jsonStr.substring(0, 200));
      }
    }

    textContent = text.replace(toolCallRegex, '').trim();

    if (toolCalls.length === 0) {
      const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"name"\s*:\s*"[\s\S]*?\})\s*```/g;
      while ((match = jsonBlockRegex.exec(text)) !== null) {
        const blockJson = match[1] ?? '';
        if (!blockJson) continue;
        try {
          const parsed = JSON.parse(blockJson) as { name?: string; arguments?: Record<string, unknown> };
          if (parsed.name && typeof parsed.name === 'string') {
            toolCalls.push({
              name: parsed.name,
              arguments: parsed.arguments ?? {},
            });
            textContent = text.replace(match[0], '').trim();
          }
        } catch {
          // Not valid tool call JSON
        }
      }
    }

    return { toolCalls, textContent };
  }

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

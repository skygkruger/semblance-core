// NativeProvider — LLMProvider implementation backed by llama.cpp via Rust FFI.
//
// Uses dependency injection: accepts a NativeRuntimeBridge interface in constructor.
// The bridge implementation is provided by the desktop app (which calls through
// to Rust NativeRuntime via NDJSON callbacks). This keeps packages/core/ free of
// Tauri/platform imports.
//
// Tool calling: When tools are provided in a ChatRequest, NativeProvider injects
// tool definitions into the system prompt and parses <tool_call> JSON blocks from
// the model's response. This enables the orchestrator's full agent loop without
// requiring Rust-side function-calling support.
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
    // If tools are provided, inject them into the system prompt
    const messages = request.tools && request.tools.length > 0
      ? this.injectToolsIntoMessages(request.messages, request.tools)
      : request.messages;

    // Extract system prompt and user messages separately so the Rust side
    // can apply the correct ChatML template. DO NOT double-template here —
    // native_runtime.rs wraps with <|im_start|>system/user/assistant<|im_end|>.
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined;

    // Build the user/assistant turns into a single prompt for the Rust ChatML template.
    // The Rust side wraps the prompt as the "user" turn, so we concatenate history + latest.
    const prompt = nonSystemMessages.map(m => {
      if (m.role === 'assistant') return `Assistant: ${m.content}`;
      return m.content;
    }).join('\n\n');

    const result = await this.bridge.generate({
      prompt,
      systemPrompt,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop,
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
      // Fallback: non-streaming generate, yield entire response at once
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

  // ─── Tool Calling Support ───────────────────────────────────────────────────

  /**
   * Inject tool definitions into the system message so the model knows how to
   * call tools. Uses a format compatible with most instruction-tuned models
   * (Llama 3.1+, Mistral, Qwen, etc.).
   */
  private injectToolsIntoMessages(
    messages: Array<{ role: string; content: string }>,
    tools: ToolDefinition[],
  ): Array<{ role: string; content: string }> {
    const toolBlock = this.formatToolDefinitions(tools);
    const result = [...messages];

    // Find the system message and append tool definitions
    const systemIdx = result.findIndex(m => m.role === 'system');
    if (systemIdx >= 0) {
      const existing = result[systemIdx]!;
      result[systemIdx] = {
        role: existing.role,
        content: existing.content + '\n\n' + toolBlock,
      };
    } else {
      // No system message — prepend one
      result.unshift({ role: 'system', content: toolBlock });
    }

    return result;
  }

  /**
   * Format tool definitions as a prompt block the model can understand.
   */
  private formatToolDefinitions(tools: ToolDefinition[]): string {
    // Compact format — only core tools, one-line descriptions.
    // Small models (7B) get confused by verbose tool definitions.
    // The orchestrator's intent extraction handles tool calling robustly
    // even when the model doesn't output perfect formatted calls.
    const coreTools = tools.filter(t =>
      ['search_web', 'deep_search_web', 'fetch_url', 'fetch_inbox', 'search_emails',
       'send_email', 'draft_email', 'fetch_calendar', 'create_reminder',
       'search_knowledge', 'search_files'].includes(t.name)
    );
    const toolList = (coreTools.length > 0 ? coreTools : tools.slice(0, 10))
      .map(t => `- ${t.name}: ${t.description?.split('.')[0] ?? ''}`)
      .join('\n');

    return `To use a tool: tool_name({"key":"value"})

Available tools:
${toolList}

Answer from knowledge first. Use tools only when needed.`;
  }

  /**
   * Parse <tool_call> blocks from the model's response.
   * Returns extracted tool calls and the remaining text content.
   */
  private parseToolCalls(text: string): { toolCalls: ToolCall[]; textContent: string } {
    const toolCalls: ToolCall[] = [];
    let textContent = text;

    // Match <tool_call>...</tool_call> blocks
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
        // Malformed JSON — skip this tool call
        console.error('[NativeProvider] Failed to parse tool call JSON:', jsonStr.substring(0, 200));
      }
    }

    // Remove tool call blocks from the text content
    textContent = text.replace(toolCallRegex, '').trim();

    // Handle ```json blocks
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

    // Handle Qwen-style function calls: tool_name({"key": "value"})
    // Qwen 2.5 models naturally output this format instead of XML blocks.
    if (toolCalls.length === 0) {
      const funcCallRegex = /\b([a-z_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)/g;
      while ((match = funcCallRegex.exec(text)) !== null) {
        const funcName = match[1] ?? '';
        const argsJson = match[2] ?? '';
        if (!funcName || !argsJson) continue;
        try {
          const args = JSON.parse(argsJson) as Record<string, unknown>;
          toolCalls.push({ name: funcName, arguments: args });
          textContent = text.replace(match[0], '').trim();
        } catch {
          // Not valid JSON arguments
        }
      }
    }

    return { toolCalls, textContent };
  }

  // ─── Prompt Formatting ──────────────────────────────────────────────────────

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

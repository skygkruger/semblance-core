// Ollama LLM Provider — Wraps the local Ollama server.
//
// ARCHITECTURAL NOTE: The `ollama` package communicates with the local
// Ollama server via HTTP to http://localhost:11434. This is the SOLE
// exception to Rule 1's network ban in the AI Core, under these constraints:
//   1. Only allowed in packages/core/llm/ (privacy audit enforces this)
//   2. Only connects to localhost / 127.0.0.1 / ::1 — NEVER a remote host
//   3. Initialization REFUSES non-localhost URLs with a hard error
//
// WHY NOT ROUTE THROUGH GATEWAY? The Gateway's rule is "it does not reason
// about user data." LLM inference IS reasoning about user data. The Ollama
// server is a local process, architecturally equivalent to a local database.
// No data leaves the device.

import { Ollama } from 'ollama';
import type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
  ToolCall,
} from './types.js';

const EMBEDDING_MODEL_FAMILIES = ['nomic-embed', 'all-minilm', 'mxbai-embed', 'snowflake-arctic-embed'];
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;
const NS_TO_MS = 1_000_000;

function isLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function isEmbeddingModel(name: string): boolean {
  const lower = name.toLowerCase();
  return EMBEDDING_MODEL_FAMILIES.some(family => lower.includes(family));
}

export class OllamaProvider implements LLMProvider {
  private client: Ollama;
  private baseUrl: string;

  constructor(config?: { baseUrl?: string }) {
    this.baseUrl = config?.baseUrl ?? 'http://localhost:11434';

    // HARD SAFETY CHECK: Refuse non-localhost URLs
    if (!isLocalhost(this.baseUrl)) {
      throw new Error(
        `[OllamaProvider] SECURITY: Refused non-localhost URL "${this.baseUrl}". ` +
        'The Ollama provider may ONLY connect to localhost. ' +
        'This is a hard safety constraint — no data may leave this device.'
      );
    }

    this.client = new Ollama({ host: this.baseUrl });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.list();
      return true;
    } catch {
      return false;
    }
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const startMs = Date.now();

    const response = await this.client.generate({
      model: request.model,
      prompt: request.prompt,
      system: request.system,
      stream: false,
      format: request.format,
      options: {
        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
        num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stop: request.stop,
      },
    });

    return {
      text: response.response,
      model: response.model,
      tokensUsed: {
        prompt: response.prompt_eval_count ?? 0,
        completion: response.eval_count ?? 0,
        total: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      durationMs: response.total_duration
        ? Math.round(response.total_duration / NS_TO_MS)
        : Date.now() - startMs,
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startMs = Date.now();

    // Map our tool definitions to Ollama's format
    const ollamaTools = request.tools?.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.client.chat({
      model: request.model,
      messages,
      stream: false,
      format: request.format,
      tools: ollamaTools,
      options: {
        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
        num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stop: request.stop,
      },
    });

    // Map Ollama tool calls to our format
    let toolCalls: ToolCall[] | undefined;
    let contentText = response.message.content;
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      toolCalls = response.message.tool_calls.map(tc => ({
        name: tc.function.name,
        arguments: tc.function.arguments as Record<string, unknown>,
      }));
    }

    // Fallback: some models emit tool calls as raw JSON in the content text
    // instead of using the structured tool_calls field. Parse them out so
    // the orchestrator can execute them instead of showing raw JSON to the user.
    if (!toolCalls && contentText && request.tools && request.tools.length > 0) {
      const parsed = this.parseTextToolCalls(contentText, request.tools);
      if (parsed.toolCalls.length > 0) {
        toolCalls = parsed.toolCalls;
        contentText = parsed.textContent;
      }
    }

    return {
      message: {
        role: response.message.role as 'system' | 'user' | 'assistant',
        content: contentText,
      },
      model: response.model,
      tokensUsed: {
        prompt: response.prompt_eval_count ?? 0,
        completion: response.eval_count ?? 0,
        total: (response.prompt_eval_count ?? 0) + (response.eval_count ?? 0),
      },
      durationMs: response.total_duration
        ? Math.round(response.total_duration / NS_TO_MS)
        : Date.now() - startMs,
      toolCalls,
    };
  }

  // AUTONOMOUS DECISION: Added chatStream() for real-time token streaming.
  // Reasoning: The build prompt (STEP-4B) requires "tokens stream in real-time —
  // the user sees words appearing, not a loading spinner followed by a wall of text."
  // The existing chat() method uses stream: false. This is a minimal addition that
  // enables the desktop sidecar to stream tokens to the frontend.
  // Escalation check: Build prompt authorizes minimal Core bug fixes for blocking issues.
  async *chatStream(request: ChatRequest): AsyncIterable<string> {
    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.client.chat({
      model: request.model,
      messages,
      stream: true,
      options: {
        temperature: request.temperature ?? DEFAULT_TEMPERATURE,
        num_predict: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        stop: request.stop,
      },
    });

    for await (const chunk of response) {
      if (chunk.message?.content) {
        yield chunk.message.content;
      }
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const startMs = Date.now();

    const response = await this.client.embed({
      model: request.model,
      input: request.input,
    });

    return {
      embeddings: response.embeddings,
      model: response.model,
      durationMs: response.total_duration
        ? Math.round(response.total_duration / NS_TO_MS)
        : Date.now() - startMs,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await this.client.list();

    return response.models.map(m => ({
      name: m.name,
      size: m.size,
      parameterCount: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
      family: m.details?.family,
      isEmbedding: isEmbeddingModel(m.name),
    }));
  }

  async getModel(name: string): Promise<ModelInfo | null> {
    try {
      const response = await this.client.show({ model: name });
      return {
        name,
        size: 0, // show() doesn't return size directly
        parameterCount: response.details?.parameter_size,
        quantization: response.details?.quantization_level,
        family: response.details?.family,
        isEmbedding: isEmbeddingModel(name),
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse tool calls from raw text output when the model doesn't use
   * structured tool_calls. Handles:
   * - <tool_call>{...}</tool_call> blocks
   * - ```json blocks with {name, arguments/parameters}
   * - Bare JSON objects matching known tool names
   */
  private parseTextToolCalls(
    text: string,
    tools: Array<{ name: string }>,
  ): { toolCalls: ToolCall[]; textContent: string } {
    const toolCalls: ToolCall[] = [];
    let textContent = text;
    const toolNames = new Set(tools.map(t => t.name));

    // Pattern 1: <tool_call>...</tool_call>
    const tagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
      const jsonStr = (match[1] ?? '').trim();
      if (!jsonStr) continue;
      try {
        const parsed = JSON.parse(jsonStr) as { name?: string; arguments?: Record<string, unknown>; parameters?: Record<string, unknown> };
        if (parsed.name && toolNames.has(parsed.name)) {
          toolCalls.push({ name: parsed.name, arguments: parsed.arguments ?? parsed.parameters ?? {} });
        }
      } catch { /* skip malformed */ }
    }
    if (toolCalls.length > 0) {
      textContent = text.replace(tagRegex, '').trim();
      return { toolCalls, textContent };
    }

    // Pattern 2: ```json blocks
    const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"name"\s*:\s*"[\s\S]*?\})\s*```/g;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      const blockJson = match[1] ?? '';
      if (!blockJson) continue;
      try {
        const parsed = JSON.parse(blockJson) as { name?: string; arguments?: Record<string, unknown>; parameters?: Record<string, unknown> };
        if (parsed.name && toolNames.has(parsed.name)) {
          toolCalls.push({ name: parsed.name, arguments: parsed.arguments ?? parsed.parameters ?? {} });
        }
      } catch { /* skip */ }
    }
    if (toolCalls.length > 0) {
      textContent = text.replace(codeBlockRegex, '').trim();
      return { toolCalls, textContent };
    }

    // Pattern 3: Bare JSON object with a known tool name
    const bareJsonRegex = /\{[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*\}/g;
    while ((match = bareJsonRegex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[0]) as { name?: string; arguments?: Record<string, unknown>; parameters?: Record<string, unknown> };
        if (parsed.name && toolNames.has(parsed.name)) {
          toolCalls.push({ name: parsed.name, arguments: parsed.arguments ?? parsed.parameters ?? {} });
          textContent = text.replace(match[0], '').trim();
        }
      } catch { /* skip */ }
    }

    return { toolCalls, textContent };
  }
}

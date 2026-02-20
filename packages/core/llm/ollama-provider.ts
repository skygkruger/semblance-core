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
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      toolCalls = response.message.tool_calls.map(tc => ({
        name: tc.function.name,
        arguments: tc.function.arguments as Record<string, unknown>,
      }));
    }

    return {
      message: {
        role: response.message.role as 'system' | 'user' | 'assistant',
        content: response.message.content,
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
}

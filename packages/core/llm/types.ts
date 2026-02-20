// LLM Provider Interface — Abstraction over local LLM backends.
// Default: Ollama. Future: llama.cpp, MLX.
// CRITICAL: All LLM inference is local. No cloud APIs. Ever.

export interface LLMProvider {
  /** Check if the provider is available and responsive */
  isAvailable(): Promise<boolean>;

  /** Generate a text completion */
  generate(request: GenerateRequest): Promise<GenerateResponse>;

  /** Generate a chat completion (multi-turn) */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Generate embeddings for text (used by knowledge graph) */
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  /** List available models */
  listModels(): Promise<ModelInfo[]>;

  /** Get info about a specific model */
  getModel(name: string): Promise<ModelInfo | null>;
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;      // 0.0–2.0, default 0.7
  maxTokens?: number;        // default 2048
  stop?: string[];
  format?: 'json';           // Force JSON output
}

export interface GenerateResponse {
  text: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  durationMs: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  format?: 'json';
  tools?: ToolDefinition[];   // For function-calling
}

export interface ChatResponse {
  message: ChatMessage;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  durationMs: number;
  toolCalls?: ToolCall[];     // If the model invoked tools
}

export interface EmbedRequest {
  model: string;              // e.g., 'nomic-embed-text', 'all-minilm'
  input: string | string[];   // Single text or batch
}

export interface EmbedResponse {
  embeddings: number[][];     // One embedding vector per input
  model: string;
  durationMs: number;
}

export interface ModelInfo {
  name: string;               // e.g., 'llama3.2:8b-instruct-q4_K_M'
  size: number;               // bytes
  parameterCount?: string;    // e.g., '8B'
  quantization?: string;      // e.g., 'Q4_K_M'
  family?: string;            // e.g., 'llama'
  isEmbedding: boolean;       // True for embedding models
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema for parameters
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

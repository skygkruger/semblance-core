// LLM Integration Layer — Export provider interface and Ollama implementation.

export type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ChatRequest,
  ChatMessage,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ModelInfo,
  ToolDefinition,
  ToolCall,
} from './types.js';

export { OllamaProvider } from './ollama-provider.js';
export { ModelManager } from './model-manager.js';
export type { ModelRecommendation } from './model-manager.js';

import type { LLMProvider } from './types.js';
import { OllamaProvider } from './ollama-provider.js';

/**
 * Create an LLM provider. Defaults to Ollama on localhost.
 */
export function createLLMProvider(config?: { baseUrl?: string }): LLMProvider {
  return new OllamaProvider(config);
}

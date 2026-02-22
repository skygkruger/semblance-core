// NativeRuntimeBridge Interface — Contract between NativeProvider (Core) and
// the desktop platform that provides the actual Rust FFI bridge.
//
// KEY CONSTRAINT: packages/core/ CANNOT import Tauri or any platform-specific code.
// NativeProvider accepts this interface in its constructor. The desktop app provides
// the real implementation that calls through to Rust NativeRuntime via NDJSON callbacks.
//
// CRITICAL: No network imports. Pure interface definition.

export interface NativeRuntimeBridge {
  /**
   * Generate text from a prompt using the loaded reasoning model.
   */
  generate(params: NativeBridgeGenerateParams): Promise<NativeBridgeGenerateResult>;

  /**
   * Stream text generation token-by-token.
   * Returns an async iterable of string tokens.
   */
  generateStream?(params: NativeBridgeGenerateParams): AsyncIterable<string>;

  /**
   * Generate embeddings for a batch of texts using the loaded embedding model.
   */
  embed(params: NativeBridgeEmbedParams): Promise<NativeBridgeEmbedResult>;

  /**
   * Load a reasoning model from a GGUF file path.
   */
  loadModel(modelPath: string): Promise<void>;

  /**
   * Load an embedding model from a GGUF file path.
   */
  loadEmbeddingModel(modelPath: string): Promise<void>;

  /**
   * Unload the currently loaded reasoning model.
   */
  unloadModel(): Promise<void>;

  /**
   * Get the current status of the native runtime.
   */
  getStatus(): Promise<NativeBridgeStatus>;

  /**
   * Check if the native runtime is available (loaded and ready).
   */
  isReady(): Promise<boolean>;
}

export interface NativeBridgeGenerateParams {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
}

export interface NativeBridgeGenerateResult {
  text: string;
  tokensGenerated: number;
  durationMs: number;
}

export interface NativeBridgeEmbedParams {
  input: string[];
}

export interface NativeBridgeEmbedResult {
  embeddings: number[][];
  dimensions: number;
  durationMs: number;
}

export interface NativeBridgeStatus {
  status: 'uninitialized' | 'loading' | 'ready' | 'error';
  reasoningModel: string | null;
  embeddingModel: string | null;
  error?: string;
}

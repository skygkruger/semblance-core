// Embedding Pipeline — Wraps LLMProvider.embed() with batch processing,
// dimension tracking, retry logic, and progress reporting.
// Used by Indexer and RetroactiveEmbedder for all embedding operations.

import type { LLMProvider, EmbedResponse } from '../llm/types.js';

export interface EmbeddingPipelineConfig {
  llm: LLMProvider;
  model: string;
  dimensions: number;
  /** Max texts per batch. Default: 32 */
  batchSize?: number;
  /** Max retries per batch. Default: 2 */
  maxRetries?: number;
  /** Delay between retries in ms. Default: 1000 */
  retryDelayMs?: number;
}

export interface EmbeddingResult {
  embeddings: number[][];
  totalTokens: number;
  durationMs: number;
  batchesProcessed: number;
  retriesUsed: number;
}

export interface EmbeddingProgress {
  processedTexts: number;
  totalTexts: number;
  currentBatch: number;
  totalBatches: number;
}

const DEFAULT_BATCH_SIZE = 32;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

export class EmbeddingPipeline {
  private llm: LLMProvider;
  private model: string;
  private dimensions: number;
  private batchSize: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(config: EmbeddingPipelineConfig) {
    this.llm = config.llm;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /** Get the configured embedding dimensions. */
  getDimensions(): number {
    return this.dimensions;
  }

  /** Get the configured model name. */
  getModel(): string {
    return this.model;
  }

  /**
   * Embed a single text string.
   */
  async embedSingle(text: string): Promise<number[]> {
    const result = await this.embedBatch([text]);
    return result.embeddings[0]!;
  }

  /**
   * Embed multiple texts with automatic batching and retry logic.
   * Optionally reports progress via callback.
   */
  async embedBatch(
    texts: string[],
    onProgress?: (progress: EmbeddingProgress) => void,
  ): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], totalTokens: 0, durationMs: 0, batchesProcessed: 0, retriesUsed: 0 };
    }

    const startMs = Date.now();
    const allEmbeddings: number[][] = [];
    let totalRetries = 0;
    let batchesProcessed = 0;

    const totalBatches = Math.ceil(texts.length / this.batchSize);

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;

      onProgress?.({
        processedTexts: i,
        totalTexts: texts.length,
        currentBatch: batchNum,
        totalBatches,
      });

      const batchResult = await this.embedWithRetry(batch);
      allEmbeddings.push(...batchResult.embeddings);
      totalRetries += batchResult.retriesUsed;
      batchesProcessed++;
    }

    onProgress?.({
      processedTexts: texts.length,
      totalTexts: texts.length,
      currentBatch: totalBatches,
      totalBatches,
    });

    return {
      embeddings: allEmbeddings,
      totalTokens: 0, // LLM provider doesn't expose token count for embeddings
      durationMs: Date.now() - startMs,
      batchesProcessed,
      retriesUsed: totalRetries,
    };
  }

  /**
   * Embed a batch with retry logic.
   */
  private async embedWithRetry(
    texts: string[],
  ): Promise<{ embeddings: number[][]; retriesUsed: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response: EmbedResponse = await this.llm.embed({
          model: this.model,
          input: texts,
        });

        // Validate dimensions
        for (const embedding of response.embeddings) {
          if (embedding.length !== this.dimensions) {
            throw new Error(
              `Dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`
            );
          }
        }

        return { embeddings: response.embeddings, retriesUsed: attempt };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Embedding failed after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

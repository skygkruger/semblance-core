// Adaptive Context Budget — Replaces hardcoded context limits with model-aware allocation.
//
// Token estimation: characters / 3.5. No external tokenizer library. Pure math.
// Budget allocation is percentage-based against the active model's context window.
// History summarization fires asynchronously when history exceeds its allocation.
// Tool results are budget-checked before appending with truncation markers.
//
// CRITICAL: No network imports. No user-visible token info. Invisible infrastructure.

/**
 * Model context window registry. Covers all models in both standard and BitNet catalogs.
 * Values are in tokens. Key is a prefix-matched family name (not exact model ID).
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // SmolLM2 fast tier
  'smollm2-1.7b': 8192,
  // Qwen families
  'qwen3-1.7b': 32768,
  'qwen3-4b': 32768,
  'qwen3-8b': 32768,
  'qwen3-30b-a3b': 32768,
  'qwen2.5-1.5b': 32768,
  'qwen2.5-3b': 32768,
  'qwen2.5-7b': 32768,
  'qwen2.5-vl-3b': 32768,
  // Llama family
  'llama-3.1-8b': 131072,
  'llama-3.2-3b': 131072,
  // Mistral / Gemma
  'mistral-7b': 32768,
  'gemma-2-2b': 8192,
  // Falcon3 standard (Ollama GGUF)
  'falcon3-7b': 8192,
  'falcon3-3b': 8192,
  'falcon3-1b': 8192,
  'falcon3-10b': 8192,
  // Falcon3 BitNet variants (1.58-bit suffix in ID)
  'falcon3-1b-instruct': 8192,
  'falcon3-3b-instruct': 8192,
  'falcon3-7b-instruct': 8192,
  'falcon3-10b-instruct': 8192,
  // Falcon-E native 1-bit family
  'falcon-e-3b': 2048,
  'falcon-e-1b': 2048,
  // BitNet b1.58 family — all variants share 4096 context
  'bitnet-b1.58-2b': 4096,
  'bitnet': 4096,
  // Vision
  'moondream2': 2048,
  // Embedding models don't pass through AdaptiveContextBudget — they use a fixed
  // 8192-token context window handled by the embedding pipeline directly.
  // 'nomic-bert' family intentionally omitted.
  'default': 4096,
};

/**
 * Budget allocation percentages (of total context window).
 * Must sum to 100%.
 */
const BUDGET_ALLOCATIONS = {
  system_prompt: 0.15,       // 15% — fixed, always fits first
  intent_context: 0.05,      // 5%
  document_context: 0.30,    // 30%
  knowledge_graph: 0.20,     // 20%
  conversation_history: 0.20,// 20%
  headroom: 0.10,            // 10% — current message + tools + response buffer
} as const;

export interface BudgetAllocation {
  totalTokens: number;
  systemPromptTokens: number;
  intentContextTokens: number;
  documentContextTokens: number;
  knowledgeGraphTokens: number;
  conversationHistoryTokens: number;
  headroomTokens: number;
}

export interface TruncationResult {
  content: string;
  wasTruncated: boolean;
  originalChars: number;
  keptChars: number;
}

/**
 * AdaptiveContextBudget manages token allocation across message components
 * based on the active model's context window.
 */
export class AdaptiveContextBudget {
  private charsPerToken: number = 3.5;
  private modelActuals: Map<string, number> = new Map();

  /**
   * Get the context window size for a model (in tokens).
   */
  getContextWindow(modelId: string): number {
    // Try exact match first
    if (MODEL_CONTEXT_WINDOWS[modelId] !== undefined) {
      return MODEL_CONTEXT_WINDOWS[modelId]!;
    }

    // Prefix match: try progressively shorter prefixes
    const parts = modelId.split('-');
    for (let i = parts.length; i > 0; i--) {
      const prefix = parts.slice(0, i).join('-');
      if (MODEL_CONTEXT_WINDOWS[prefix] !== undefined) {
        return MODEL_CONTEXT_WINDOWS[prefix]!;
      }
    }

    // Family match: check if any key is contained in the model ID
    for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (key !== 'default' && modelId.includes(key)) {
        return value;
      }
    }

    return MODEL_CONTEXT_WINDOWS['default']!;
  }

  /**
   * Calculate budget allocation for a model.
   */
  allocate(modelId: string): BudgetAllocation {
    const totalTokens = this.getContextWindow(modelId);
    return {
      totalTokens,
      systemPromptTokens: Math.floor(totalTokens * BUDGET_ALLOCATIONS.system_prompt),
      intentContextTokens: Math.floor(totalTokens * BUDGET_ALLOCATIONS.intent_context),
      documentContextTokens: Math.floor(totalTokens * BUDGET_ALLOCATIONS.document_context),
      knowledgeGraphTokens: Math.floor(totalTokens * BUDGET_ALLOCATIONS.knowledge_graph),
      conversationHistoryTokens: Math.floor(totalTokens * BUDGET_ALLOCATIONS.conversation_history),
      headroomTokens: Math.floor(totalTokens * BUDGET_ALLOCATIONS.headroom),
    };
  }

  /**
   * Estimate token count from a string.
   * Uses running average of chars-per-token from actual model responses.
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / this.charsPerToken);
  }

  /**
   * Convert token budget to approximate character limit.
   */
  tokensToChars(tokens: number): number {
    return Math.floor(tokens * this.charsPerToken);
  }

  /**
   * Truncate content to fit within a token budget.
   * Adds a truncation marker if content exceeds the budget.
   */
  truncateToFit(content: string, budgetTokens: number): TruncationResult {
    const originalChars = content.length;
    const budgetChars = this.tokensToChars(budgetTokens);

    if (originalChars <= budgetChars) {
      return { content, wasTruncated: false, originalChars, keptChars: originalChars };
    }

    // Reserve space for truncation marker
    const markerTemplate = `\n[result truncated — ${originalChars} chars total, showing first  chars]`;
    const markerOverhead = markerTemplate.length + 10; // extra digits
    const keptChars = Math.max(0, budgetChars - markerOverhead);
    const marker = `\n[result truncated — ${originalChars} chars total, showing first ${keptChars} chars]`;

    return {
      content: content.slice(0, keptChars) + marker,
      wasTruncated: true,
      originalChars,
      keptChars,
    };
  }

  /**
   * Calculate how many history turns fit within the history budget.
   * Returns the number of turns to keep (from the end of the array).
   */
  calculateHistoryTurns(
    turns: Array<{ content: string }>,
    modelId: string,
  ): number {
    const budget = this.allocate(modelId);
    const historyBudgetChars = this.tokensToChars(budget.conversationHistoryTokens);

    let totalChars = 0;
    let count = 0;

    // Walk backwards from most recent
    for (let i = turns.length - 1; i >= 0; i--) {
      const turnChars = turns[i]!.content.length;
      if (totalChars + turnChars > historyBudgetChars && count > 0) {
        break;
      }
      totalChars += turnChars;
      count++;
    }

    return count;
  }

  /**
   * Check if history exceeds its allocation and needs summarization.
   */
  needsSummarization(
    turns: Array<{ content: string }>,
    modelId: string,
  ): boolean {
    const budget = this.allocate(modelId);
    const historyBudgetChars = this.tokensToChars(budget.conversationHistoryTokens);

    const totalChars = turns.reduce((sum, t) => sum + t.content.length, 0);
    return totalChars > historyBudgetChars;
  }

  /**
   * Calculate the maximum number of knowledge graph results to include.
   */
  calculateKnowledgeLimit(modelId: string, avgResultChars: number = 500): number {
    const budget = this.allocate(modelId);
    const kgBudgetChars = this.tokensToChars(budget.knowledgeGraphTokens);
    return Math.max(1, Math.floor(kgBudgetChars / avgResultChars));
  }

  /**
   * Calculate the maximum chars for document context chunks.
   */
  calculateDocChunkSize(modelId: string, numChunks: number): number {
    if (numChunks === 0) return 0;
    const budget = this.allocate(modelId);
    const docBudgetChars = this.tokensToChars(budget.documentContextTokens);
    return Math.floor(docBudgetChars / numChunks);
  }

  /**
   * Record actual token counts from an inference response.
   * Updates the chars-per-token estimate for the model family.
   */
  recordActualTokens(modelId: string, promptChars: number, promptTokens: number): void {
    if (promptTokens <= 0 || promptChars <= 0) return;

    const actualCpt = promptChars / promptTokens;

    // Running average with existing data
    const key = this.getModelFamily(modelId);
    const existing = this.modelActuals.get(key);
    if (existing !== undefined) {
      // Weighted average: 80% existing, 20% new observation
      this.modelActuals.set(key, existing * 0.8 + actualCpt * 0.2);
    } else {
      this.modelActuals.set(key, actualCpt);
    }

    // Update global estimate based on all observed families
    if (this.modelActuals.size > 0) {
      let sum = 0;
      for (const v of this.modelActuals.values()) sum += v;
      this.charsPerToken = sum / this.modelActuals.size;
    }
  }

  /**
   * Get the current chars-per-token estimate (for debugging/testing).
   */
  getCharsPerToken(): number {
    return this.charsPerToken;
  }

  /**
   * Get model family key for chars-per-token tracking.
   */
  private getModelFamily(modelId: string): string {
    // Extract family prefix (e.g., 'qwen3' from 'qwen3-8b-instruct-q4_k_m')
    const parts = modelId.split('-');
    if (parts.length >= 2) return parts.slice(0, 2).join('-');
    return parts[0] ?? 'default';
  }
}

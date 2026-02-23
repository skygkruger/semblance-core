/**
 * LLM Categorizer — Transaction categorization via local LLM.
 *
 * Uses the CATEGORY_TAXONOMY as context for the LLM prompt.
 * Falls back to keyword matching when LLM is unavailable or returns bad data.
 * Triple-layer JSON parsing: direct → code-block extraction → fallback.
 */

import type { LLMProvider } from '../llm/types.js';
import { CATEGORY_TAXONOMY, type CategoryDefinition } from './category-taxonomy.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UncategorizedTransaction {
  id: string;
  merchantNormalized: string;
  merchantRaw: string;
  amount: number;  // cents
}

export interface CategorizationResult {
  transactionId: string;
  category: string;
  subcategory: string;
  confidence: number;   // 0-1
  method: 'llm' | 'keyword' | 'fallback';
}

// ─── LLM Categorizer ───────────────────────────────────────────────────────

export class LLMCategorizer {
  private llm: LLMProvider;
  private model: string;
  private taxonomy: CategoryDefinition[];

  constructor(config: { llm: LLMProvider; model?: string; taxonomy?: CategoryDefinition[] }) {
    this.llm = config.llm;
    this.model = config.model ?? 'llama3.2:8b';
    this.taxonomy = config.taxonomy ?? CATEGORY_TAXONOMY;
  }

  /**
   * Categorize a batch of transactions (max 15 at a time).
   */
  async categorizeBatch(transactions: UncategorizedTransaction[]): Promise<CategorizationResult[]> {
    if (transactions.length === 0) return [];

    const batch = transactions.slice(0, 15);
    const taxonomyContext = this.taxonomy
      .filter(c => c.name !== 'Other')
      .map(c => `${c.name}: ${c.subcategories.join(', ')}`)
      .join('\n');

    const txnList = batch.map((t, i) =>
      `${i + 1}. "${t.merchantNormalized}" (${t.merchantRaw}) $${Math.abs(t.amount / 100).toFixed(2)}`
    ).join('\n');

    const prompt = `Categorize each transaction into one of these categories and subcategories:

${taxonomyContext}

Transactions:
${txnList}

Respond with ONLY a JSON array. Each element: {"category": "...", "subcategory": "...", "confidence": 0.0-1.0}
Example: [{"category": "Food & Dining", "subcategory": "Coffee", "confidence": 0.95}]`;

    try {
      const available = await this.llm.isAvailable();
      if (!available) {
        return batch.map(t => this.fallbackCategorize(t.merchantNormalized, t.amount, t.id));
      }

      const response = await this.llm.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });

      const parsed = this.parseJsonResponse(response.message.content);
      if (!parsed || parsed.length !== batch.length) {
        return batch.map(t => this.fallbackCategorize(t.merchantNormalized, t.amount, t.id));
      }

      return batch.map((t, i) => {
        const result = parsed[i]!;
        return {
          transactionId: t.id,
          category: result.category || 'Other',
          subcategory: result.subcategory || '',
          confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
          method: 'llm' as const,
        };
      });
    } catch {
      return batch.map(t => this.fallbackCategorize(t.merchantNormalized, t.amount, t.id));
    }
  }

  /**
   * Categorize a single transaction.
   */
  async categorize(transaction: UncategorizedTransaction): Promise<CategorizationResult> {
    const results = await this.categorizeBatch([transaction]);
    return results[0]!;
  }

  /**
   * Keyword-based fallback categorization using taxonomy keywords.
   */
  fallbackCategorize(merchantNormalized: string, amount: number, transactionId: string): CategorizationResult {
    const lower = merchantNormalized.toLowerCase();

    // Income heuristic: positive amount
    if (amount > 0) {
      return {
        transactionId,
        category: 'Income',
        subcategory: lower.includes('refund') ? 'Refund' : 'Salary',
        confidence: 0.6,
        method: 'keyword',
      };
    }

    // Keyword matching against taxonomy
    for (const cat of this.taxonomy) {
      for (const keyword of cat.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          return {
            transactionId,
            category: cat.name,
            subcategory: cat.subcategories[0] ?? '',
            confidence: 0.7,
            method: 'keyword',
          };
        }
      }
    }

    return {
      transactionId,
      category: 'Other',
      subcategory: 'Uncategorized',
      confidence: 0.3,
      method: 'fallback',
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Triple-layer JSON parsing: direct → code-block extraction → null.
   */
  private parseJsonResponse(content: string): Array<{ category: string; subcategory: string; confidence: number }> | null {
    // Layer 1: Direct parse
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }

    // Layer 2: Extract from code block
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch?.[1]) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }

    // Layer 3: Try extracting array portion
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* continue */ }
    }

    return null;
  }
}

/**
 * Import Pipeline — Unified import from CSV, OFX, and Plaid.
 *
 * Bridges Sprint 2's StatementParser (float amounts) to Step 19's
 * TransactionStore (integer cents). Handles deduplication and queues
 * transactions for LLM categorization.
 */

import { nanoid } from 'nanoid';
import { StatementParser } from './statement-parser.js';
import { MerchantNormalizer } from './merchant-normalizer.js';
import type { TransactionStore, Transaction, TransactionSource } from './transaction-store.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CategorizationQueueLike {
  enqueue(ids: string[]): Promise<void>;
}

export interface ImportResult {
  imported: number;
  duplicatesSkipped: number;
  errors: string[];
  queuedForCategorization: number;
}

interface PlaidTransactionInput {
  transaction_id: string;
  date: string;               // YYYY-MM-DD
  name: string;               // merchant name
  amount: number;             // Plaid: positive = expense
  iso_currency_code: string;
  category?: string[];
  merchant_name?: string | null;
}

// ─── No-op Queue (for use before Commit 3) ────────────────────────────────

export class NoOpCategorizationQueue implements CategorizationQueueLike {
  async enqueue(_ids: string[]): Promise<void> {
    // No-op: replaced by real CategorizationQueue in Commit 3
  }
}

// ─── Import Pipeline ────────────────────────────────────────────────────────

export class ImportPipeline {
  private store: TransactionStore;
  private normalizer: MerchantNormalizer;
  private queue: CategorizationQueueLike;
  private parser: StatementParser;

  constructor(config: {
    store: TransactionStore;
    normalizer: MerchantNormalizer;
    queue?: CategorizationQueueLike;
  }) {
    this.store = config.store;
    this.normalizer = config.normalizer;
    this.queue = config.queue ?? new NoOpCategorizationQueue();
    this.parser = new StatementParser();
  }

  /**
   * Import transactions from CSV data.
   */
  async importFromCSV(csvData: string, accountId: string): Promise<ImportResult> {
    const parsed = await this.parser.parseCSV(csvData);
    return this.processImport(parsed, accountId, 'csv');
  }

  /**
   * Import transactions from OFX/QFX data.
   */
  async importFromOFX(ofxData: string, accountId: string): Promise<ImportResult> {
    const parsed = this.parser.parseOFX(ofxData);
    return this.processImport(parsed, accountId, 'ofx');
  }

  /**
   * Import transactions from Plaid sync response.
   * Plaid convention: positive amount = expense. We negate for Semblance convention.
   */
  async importFromPlaid(plaidTransactions: PlaidTransactionInput[], accountId: string): Promise<ImportResult> {
    const now = new Date().toISOString();
    const transactions: Transaction[] = [];
    const errors: string[] = [];
    let duplicatesSkipped = 0;

    for (const pt of plaidTransactions) {
      try {
        // Plaid: positive = expense → negate for Semblance (expense = negative)
        const amountCents = Math.round(pt.amount * -100);
        const { name: normalized, category } = this.normalizer.normalize(pt.name);

        if (this.store.isDuplicate(accountId, pt.date, pt.name, amountCents)) {
          duplicatesSkipped++;
          continue;
        }

        transactions.push({
          id: nanoid(),
          source: 'plaid',
          accountId,
          date: pt.date,
          merchantRaw: pt.name,
          merchantNormalized: normalized,
          amount: amountCents,
          currency: pt.iso_currency_code || 'USD',
          category: category || (pt.category?.[0] ?? ''),
          subcategory: pt.category?.[1] ?? '',
          isRecurring: false,
          isSubscription: false,
          plaidTransactionId: pt.transaction_id,
          metadata: {},
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        errors.push(`Plaid transaction ${pt.transaction_id}: ${String(err)}`);
      }
    }

    if (transactions.length > 0) {
      this.store.addTransactions(transactions);
      const uncategorized = transactions.filter(t => !t.category).map(t => t.id);
      if (uncategorized.length > 0) {
        await this.queue.enqueue(uncategorized);
      }
    }

    return {
      imported: transactions.length,
      duplicatesSkipped,
      errors,
      queuedForCategorization: transactions.filter(t => !t.category).length,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async processImport(
    parsedTransactions: Array<{ id: string; date: string; amount: number; description: string; normalizedMerchant: string; category: string; isRecurring: boolean; recurrenceGroup: string | null }>,
    accountId: string,
    source: TransactionSource,
  ): Promise<ImportResult> {
    const now = new Date().toISOString();
    const transactions: Transaction[] = [];
    const errors: string[] = [];
    let duplicatesSkipped = 0;

    // Normalize merchants via Sprint 2 normalizer
    const normalized = this.normalizer.normalizeAll(
      parsedTransactions as Array<{ id: string; date: string; amount: number; description: string; normalizedMerchant: string; category: string; isRecurring: boolean; recurrenceGroup: string | null }>,
    );

    for (const parsed of normalized) {
      try {
        // Convert float amount to integer cents
        const amountCents = Math.round(parsed.amount * 100);

        if (this.store.isDuplicate(accountId, parsed.date, parsed.description, amountCents)) {
          duplicatesSkipped++;
          continue;
        }

        transactions.push({
          id: nanoid(),
          source,
          accountId,
          date: parsed.date,
          merchantRaw: parsed.description,
          merchantNormalized: parsed.normalizedMerchant,
          amount: amountCents,
          currency: 'USD',
          category: parsed.category || '',
          subcategory: '',
          isRecurring: parsed.isRecurring,
          isSubscription: false,
          plaidTransactionId: null,
          metadata: {},
          createdAt: now,
          updatedAt: now,
        });
      } catch (err) {
        errors.push(`Transaction ${parsed.id}: ${String(err)}`);
      }
    }

    if (transactions.length > 0) {
      this.store.addTransactions(transactions);
      const uncategorized = transactions.filter(t => !t.category).map(t => t.id);
      if (uncategorized.length > 0) {
        await this.queue.enqueue(uncategorized);
      }
    }

    return {
      imported: transactions.length,
      duplicatesSkipped,
      errors,
      queuedForCategorization: transactions.filter(t => !t.category).length,
    };
  }
}

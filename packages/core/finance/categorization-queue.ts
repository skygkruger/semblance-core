/**
 * Categorization Queue — Background queue for LLM transaction categorization.
 *
 * Stores uncategorized transaction IDs in SQLite. Processes in batches of 15.
 * Retries up to 3 times, then marks as 'Other/Uncategorized'.
 */

import type { DatabaseHandle } from '../platform/types.js';
import type { CategorizationQueueLike } from './import-pipeline.js';
import type { LLMCategorizer } from './llm-categorizer.js';
import type { TransactionStore } from './transaction-store.js';

// ─── SQLite Schema ──────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS categorization_queue (
    transaction_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    retries INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cat_queue_status ON categorization_queue(status);
`;

// ─── Categorization Queue ───────────────────────────────────────────────────

export class CategorizationQueue implements CategorizationQueueLike {
  private db: DatabaseHandle;
  private categorizer: LLMCategorizer;
  private store: TransactionStore;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: {
    db: DatabaseHandle;
    categorizer: LLMCategorizer;
    store: TransactionStore;
  }) {
    this.db = config.db;
    this.categorizer = config.categorizer;
    this.store = config.store;
    this.db.exec(CREATE_TABLE);
  }

  async enqueue(ids: string[]): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO categorization_queue (transaction_id, status, retries, created_at) VALUES (?, ?, 0, datetime(\'now\'))'
    );
    const insertMany = this.db.transaction((txnIds: string[]) => {
      for (const id of txnIds) {
        stmt.run(id, 'pending');
      }
    });
    insertMany(ids);
  }

  /**
   * Process the next batch (up to 15) of pending transactions.
   */
  async processNext(): Promise<number> {
    const rows = this.db.prepare(
      'SELECT transaction_id FROM categorization_queue WHERE status = ? ORDER BY created_at ASC LIMIT 15'
    ).all('pending') as Array<{ transaction_id: string }>;

    if (rows.length === 0) return 0;

    const ids = rows.map(r => r.transaction_id);
    const transactions = ids.map(id => {
      const txn = this.store.getTransaction(id);
      if (!txn) return null;
      return {
        id: txn.id,
        merchantNormalized: txn.merchantNormalized,
        merchantRaw: txn.merchantRaw,
        amount: txn.amount,
      };
    }).filter((t): t is NonNullable<typeof t> => t !== null);

    if (transactions.length === 0) {
      // Transactions were deleted; remove from queue
      const deleteStmt = this.db.prepare('DELETE FROM categorization_queue WHERE transaction_id = ?');
      for (const id of ids) deleteStmt.run(id);
      return 0;
    }

    try {
      const results = await this.categorizer.categorizeBatch(transactions);

      for (const result of results) {
        this.store.updateCategory(result.transactionId, result.category, result.subcategory);
        this.db.prepare(
          'UPDATE categorization_queue SET status = ? WHERE transaction_id = ?'
        ).run('completed', result.transactionId);
      }

      return results.length;
    } catch {
      // Increment retry count, mark as failed after 3 attempts
      for (const id of ids) {
        const row = this.db.prepare(
          'SELECT retries FROM categorization_queue WHERE transaction_id = ?'
        ).get(id) as { retries: number } | undefined;

        const retries = (row?.retries ?? 0) + 1;
        if (retries >= 3) {
          // Give up — assign 'Other/Uncategorized'
          this.store.updateCategory(id, 'Other', 'Uncategorized');
          this.db.prepare(
            'UPDATE categorization_queue SET status = ?, retries = ? WHERE transaction_id = ?'
          ).run('failed', retries, id);
        } else {
          this.db.prepare(
            'UPDATE categorization_queue SET retries = ? WHERE transaction_id = ?'
          ).run(retries, id);
        }
      }
      return 0;
    }
  }

  /**
   * Process all pending items in batches.
   */
  async processPending(): Promise<number> {
    let total = 0;
    let processed = 0;
    do {
      processed = await this.processNext();
      total += processed;
    } while (processed > 0);
    return total;
  }

  getPendingCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM categorization_queue WHERE status = ?'
    ).get('pending') as { count: number };
    return row.count;
  }

  startBackgroundProcessing(intervalMs: number = 30000): void {
    this.stopBackgroundProcessing();
    this.timer = setInterval(async () => {
      try {
        await this.processNext();
      } catch {
        // Silently continue — next interval will retry
      }
    }, intervalMs);
  }

  stopBackgroundProcessing(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

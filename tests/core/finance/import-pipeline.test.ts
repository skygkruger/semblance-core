/**
 * Step 19 — ImportPipeline tests.
 * Verifies CSV→store, OFX→store, Plaid→store, and deduplication.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { TransactionStore } from '@semblance/core/finance/transaction-store';
import { MerchantNormalizer } from '@semblance/core/finance/merchant-normalizer';
import { ImportPipeline } from '@semblance/core/finance/import-pipeline';

let db: InstanceType<typeof Database>;
let store: TransactionStore;
let pipeline: ImportPipeline;

beforeEach(() => {
  db = new Database(':memory:');
  store = new TransactionStore(db as unknown as DatabaseHandle);
  const normalizer = new MerchantNormalizer();
  pipeline = new ImportPipeline({ store, normalizer });

  // Create test account
  store.addAccount({
    id: 'acc-1',
    name: 'Test Checking',
    institution: 'Test Bank',
    type: 'checking',
    plaidAccountId: null,
    lastSyncedAt: null,
    createdAt: new Date().toISOString(),
  });
});

afterEach(() => {
  db.close();
});

describe('ImportPipeline (Step 19)', () => {
  it('imports CSV data into TransactionStore with correct cent amounts', async () => {
    const csv = `Date,Description,Amount
2026-01-15,NETFLIX INC,-14.99
2026-01-16,SPOTIFY PREMIUM,-9.99
2026-01-17,PAYCHECK,3500.00`;

    const result = await pipeline.importFromCSV(csv, 'acc-1');
    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    const txns = store.getTransactions({ accountId: 'acc-1' });
    expect(txns).toHaveLength(3);

    // Check cents conversion: -14.99 → -1499
    const netflix = txns.find(t => t.merchantNormalized === 'Netflix');
    expect(netflix).toBeDefined();
    expect(netflix!.amount).toBe(-1499);
  });

  it('imports OFX data into TransactionStore', async () => {
    const ofx = `<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260120
<TRNAMT>-25.50
<NAME>STARBUCKS COFFEE
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260121
<TRNAMT>-42.00
<NAME>AMAZON MARKETPLACE
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const result = await pipeline.importFromOFX(ofx, 'acc-1');
    expect(result.imported).toBe(2);

    const txns = store.getTransactions({ accountId: 'acc-1' });
    expect(txns).toHaveLength(2);

    // Check that amounts are in cents
    const starbucks = txns.find(t => t.merchantNormalized === 'Starbucks');
    expect(starbucks).toBeDefined();
    expect(starbucks!.amount).toBe(-2550);
  });

  it('skips duplicate transactions on re-import', async () => {
    const csv = `Date,Description,Amount
2026-01-15,NETFLIX INC,-14.99`;

    const first = await pipeline.importFromCSV(csv, 'acc-1');
    expect(first.imported).toBe(1);

    const second = await pipeline.importFromCSV(csv, 'acc-1');
    expect(second.imported).toBe(0);
    expect(second.duplicatesSkipped).toBe(1);

    // Only 1 transaction total in store
    expect(store.getTransactionCount()).toBe(1);
  });

  it('imports Plaid transactions with correct amount negation', async () => {
    const plaidTxns = [
      {
        transaction_id: 'plaid-1',
        date: '2026-01-20',
        name: 'UBER EATS',
        amount: 22.50,    // Plaid: positive = expense
        iso_currency_code: 'USD',
        category: ['Food and Drink', 'Restaurants'],
      },
      {
        transaction_id: 'plaid-2',
        date: '2026-01-21',
        name: 'PAYROLL DEPOSIT',
        amount: -5000.00,  // Plaid: negative = income
        iso_currency_code: 'USD',
      },
    ];

    const result = await pipeline.importFromPlaid(plaidTxns, 'acc-1');
    expect(result.imported).toBe(2);

    const txns = store.getTransactions({ accountId: 'acc-1' });
    expect(txns).toHaveLength(2);

    // Plaid positive (expense) → negated: 22.50 → -2250 cents
    const uber = txns.find(t => t.merchantNormalized === 'Uber Eats');
    expect(uber).toBeDefined();
    expect(uber!.amount).toBe(-2250);
    expect(uber!.source).toBe('plaid');
    expect(uber!.plaidTransactionId).toBe('plaid-1');

    // Plaid negative (income) → negated: -5000 → 500000 cents
    const payroll = txns.find(t => t.merchantRaw === 'PAYROLL DEPOSIT');
    expect(payroll).toBeDefined();
    expect(payroll!.amount).toBe(500000);
  });
});

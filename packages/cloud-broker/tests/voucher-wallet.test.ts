import { describe, expect, it } from 'vitest';
import {
  createMemoryVoucherWalletStore,
  VoucherWallet,
} from '../src/confidential/voucher-wallet.js';

describe('VoucherWallet', () => {
  it('selects a random unspent voucher and records spent digest locally', () => {
    const store = createMemoryVoucherWalletStore({
      vouchers: [
        {
          serial: 'a'.repeat(64),
          coarseClass: 'inference-standard',
          quantity: 1,
          billingPeriod: '2026-07',
          issuerKeyId: 'test-key',
          signature: 'sig-a',
        },
        {
          serial: 'b'.repeat(64),
          coarseClass: 'inference-standard',
          quantity: 1,
          billingPeriod: '2026-07',
          issuerKeyId: 'test-key',
          signature: 'sig-b',
        },
      ],
    });
    const wallet = new VoucherWallet({ store });

    const spend = wallet.spendRandom(() => '2026-07-19T00:00:00.000Z');
    expect(spend).not.toBeNull();
    expect(spend!.proof.spentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(spend!.proof.coarseClass).toBe('inference-standard');
    expect(JSON.stringify(spend!.proof)).not.toMatch(/serial|accountId|taskId/i);
    expect(wallet.unspentCount()).toBe(1);
    expect(wallet.hasSpentDigest(spend!.proof.spentDigest)).toBe(true);
  });

  it('returns null when no vouchers remain', () => {
    const wallet = new VoucherWallet();
    expect(wallet.spendRandom()).toBeNull();
  });
});

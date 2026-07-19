import { createHash, randomBytes } from 'node:crypto';

export type VoucherCoarseClass =
  | 'inference-small'
  | 'inference-standard'
  | 'inference-large';

export interface VoucherSpendProof {
  readonly spentDigest: string;
  readonly coarseClass: VoucherCoarseClass;
  readonly quantity: number;
  readonly billingPeriod: string;
  readonly signature: string;
  readonly issuerKeyId: string;
}

export interface StoredVoucher {
  readonly serial: string;
  readonly coarseClass: VoucherSpendProof['coarseClass'];
  readonly quantity: number;
  readonly billingPeriod: string;
  readonly issuerKeyId: string;
  readonly signature: string;
}

export interface VoucherWalletStore {
  listVouchers(): readonly StoredVoucher[];
  listSpentDigests(): readonly string[];
  addBatch(vouchers: readonly StoredVoucher[]): void;
  markSpent(spentDigest: string): void;
}

export interface VoucherWalletConfig {
  readonly store?: VoucherWalletStore;
}

export interface VoucherSpendResult {
  readonly proof: VoucherSpendProof;
  readonly usageReceipt: {
    readonly schemaVersion: 1;
    readonly receiptId: string;
    readonly spentDigest: string;
    readonly coarseClass: VoucherSpendProof['coarseClass'];
    readonly quantity: number;
    readonly billingPeriod: string;
    readonly redeemedAt: string;
    readonly issuerKeyId: string;
  };
}

function hashVoucherMessage(voucher: StoredVoucher): string {
  const canonical = `${voucher.serial}|${voucher.coarseClass}|${voucher.quantity}|${voucher.billingPeriod}`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function createMemoryVoucherWalletStore(
  seed: { vouchers?: StoredVoucher[]; spent?: string[] } = {},
): VoucherWalletStore & { vouchers: StoredVoucher[]; spent: Set<string> } {
  const vouchers = [...(seed.vouchers ?? [])];
  const spent = new Set(seed.spent ?? []);
  return {
    vouchers,
    spent,
    listVouchers() {
      return vouchers.filter((v) => !spent.has(hashVoucherMessage(v)));
    },
    listSpentDigests() {
      return [...spent];
    },
    addBatch(batch) {
      vouchers.push(...batch);
    },
    markSpent(spentDigest) {
      spent.add(spentDigest);
    },
  };
}

export class VoucherWallet {
  private readonly store: VoucherWalletStore;

  constructor(config: VoucherWalletConfig = {}) {
    this.store = config.store ?? createMemoryVoucherWalletStore();
  }

  addBatch(vouchers: readonly StoredVoucher[]): void {
    this.store.addBatch(vouchers);
  }

  unspentCount(): number {
    return this.store.listVouchers().length;
  }

  /**
   * Select a random unspent voucher and produce a spend proof.
   * Records spent digest locally — serial never leaves the device.
   */
  spendRandom(now: () => string = () => new Date().toISOString()): VoucherSpendResult | null {
    const available = this.store.listVouchers();
    if (available.length === 0) {
      return null;
    }
    const index = randomBytes(1)[0]! % available.length;
    const voucher = available[index]!;
    const spentDigest = hashVoucherMessage(voucher);
    this.store.markSpent(spentDigest);

    const proof: VoucherSpendProof = {
      spentDigest,
      coarseClass: voucher.coarseClass,
      quantity: voucher.quantity,
      billingPeriod: voucher.billingPeriod,
      signature: voucher.signature,
      issuerKeyId: voucher.issuerKeyId,
    };

    return {
      proof,
      usageReceipt: {
        schemaVersion: 1,
        receiptId: randomBytes(16).toString('hex'),
        spentDigest,
        coarseClass: voucher.coarseClass,
        quantity: voucher.quantity,
        billingPeriod: voucher.billingPeriod,
        redeemedAt: now(),
        issuerKeyId: voucher.issuerKeyId,
      },
    };
  }

  hasSpentDigest(spentDigest: string): boolean {
    return this.store.listSpentDigests().includes(spentDigest);
  }
}

export type { VoucherSpendProof };

export interface ConsentReceipt {
  receiptId: string;
  workflowId: string;
  grantedAt: string;
}

export interface ConsentStore {
  getReceipt(receiptId: string): Promise<ConsentReceipt | null>;
  putReceipt(receipt: ConsentReceipt): Promise<void>;
}

export function createConsentStore(initial: ConsentReceipt[] = []): ConsentStore {
  const receipts = new Map<string, ConsentReceipt>(
    initial.map((receipt) => [receipt.receiptId, receipt]),
  );

  return {
    async getReceipt(receiptId: string): Promise<ConsentReceipt | null> {
      return receipts.get(receiptId) ?? null;
    },
    async putReceipt(receipt: ConsentReceipt): Promise<void> {
      receipts.set(receipt.receiptId, receipt);
    },
  };
}

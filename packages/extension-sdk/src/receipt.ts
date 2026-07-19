/**
 * Receipt contract — audited action outcomes surfaced to extensions (no raw audit store).
 */

export type ExtensionActionReceiptStatusV1 =
  | 'success'
  | 'error'
  | 'requires_approval'
  | 'rate_limited';

export interface ExtensionActionReceiptV1 {
  receiptId: string;
  action: string;
  auditRef: string;
  status: ExtensionActionReceiptStatusV1;
  timestamp: string;
  estimatedTimeSavedSeconds: number;
  payloadSummary?: string;
}

export interface ExtensionReceiptClient {
  listRecent(limit?: number): Promise<ExtensionActionReceiptV1[]>;
  get(receiptId: string): Promise<ExtensionActionReceiptV1 | null>;
}

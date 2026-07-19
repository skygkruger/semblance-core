/**
 * BYO / self-hosted disclosure receipts.
 * Labels are explicit — never use 'confidential' for BYO paths.
 */

export type DisclosureReceiptLabel = 'byo' | 'self_hosted';

export interface DisclosureReceipt {
  readonly schemaVersion: 1;
  readonly label: DisclosureReceiptLabel;
  readonly requestId: string;
  readonly destination: 'byo' | 'self_hosted';
  readonly provider: string;
  readonly model: string;
  readonly promptContentHash: string;
  readonly responseContentHash: string;
  readonly timestamp: string;
  readonly tokensUsed: {
    readonly prompt: number;
    readonly completion: number;
    readonly total: number;
  };
}

export interface BuildDisclosureReceiptParams {
  readonly label: DisclosureReceiptLabel;
  readonly requestId: string;
  readonly destination: 'byo' | 'self_hosted';
  readonly provider: string;
  readonly model: string;
  readonly promptContentHash: string;
  readonly responseContentHash: string;
  readonly tokensUsed: {
    readonly prompt: number;
    readonly completion: number;
    readonly total: number;
  };
  readonly timestamp?: string;
}

export function buildDisclosureReceipt(params: BuildDisclosureReceiptParams): DisclosureReceipt {
  if (params.label === 'confidential' as DisclosureReceiptLabel) {
    throw new Error('Disclosure receipts for BYO paths must not use confidential label');
  }

  return {
    schemaVersion: 1,
    label: params.label,
    requestId: params.requestId,
    destination: params.destination,
    provider: params.provider,
    model: params.model,
    promptContentHash: params.promptContentHash,
    responseContentHash: params.responseContentHash,
    timestamp: params.timestamp ?? new Date().toISOString(),
    tokensUsed: params.tokensUsed,
  };
}

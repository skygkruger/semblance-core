import type { ReceiptSignature, ReceiptSignatureAlgorithm } from './receipt-crypto.js';
import {
  canonicalizeRecord,
  digestCanonical,
  signDigest,
  verifyDigestSignature,
} from './receipt-crypto.js';

export interface ConfidentialDisclosureReceiptPayload {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly requestId: string;
  readonly destination: 'confidential';
  readonly purpose: string;
  readonly disclosedFieldNames: readonly string[];
  readonly disclosedBytes: number;
  readonly promptContentHash: string;
  readonly responseContentHash: string;
  readonly occurredAt: string;
}

export interface ConfidentialDisclosureReceipt {
  readonly schemaVersion: 1;
  readonly payload: ConfidentialDisclosureReceiptPayload;
  readonly signature: ReceiptSignature;
}

export interface BuildConfidentialDisclosureReceiptParams {
  readonly receiptId: string;
  readonly requestId: string;
  readonly purpose: string;
  readonly disclosedFieldNames: readonly string[];
  readonly disclosedBytes: number;
  readonly promptContentHash: string;
  readonly responseContentHash: string;
  readonly occurredAt?: string;
  readonly signingKey: Buffer;
  readonly algorithm?: ReceiptSignatureAlgorithm;
}

export interface VerifyConfidentialDisclosureReceiptParams {
  readonly receipt: ConfidentialDisclosureReceipt;
  readonly signingKey: Buffer;
}

function payloadRecord(payload: ConfidentialDisclosureReceiptPayload): Record<string, unknown> {
  return {
    destination: payload.destination,
    disclosedBytes: payload.disclosedBytes,
    disclosedFieldNames: [...payload.disclosedFieldNames],
    occurredAt: payload.occurredAt,
    promptContentHash: payload.promptContentHash,
    purpose: payload.purpose,
    receiptId: payload.receiptId,
    requestId: payload.requestId,
    responseContentHash: payload.responseContentHash,
    schemaVersion: payload.schemaVersion,
  };
}

export function buildConfidentialDisclosureReceipt(
  params: BuildConfidentialDisclosureReceiptParams,
): ConfidentialDisclosureReceipt {
  const algorithm = params.algorithm ?? 'hmac-sha256';
  const payload: ConfidentialDisclosureReceiptPayload = {
    schemaVersion: 1,
    receiptId: params.receiptId,
    requestId: params.requestId,
    destination: 'confidential',
    purpose: params.purpose,
    disclosedFieldNames: params.disclosedFieldNames,
    disclosedBytes: params.disclosedBytes,
    promptContentHash: params.promptContentHash,
    responseContentHash: params.responseContentHash,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
  };

  const canonical = canonicalizeRecord(payloadRecord(payload));
  const digest = digestCanonical(canonical);
  const value = signDigest(digest, params.signingKey, algorithm);

  return {
    schemaVersion: 1,
    payload,
    signature: { algorithm, value },
  };
}

export function verifyConfidentialDisclosureReceipt(
  params: VerifyConfidentialDisclosureReceiptParams,
): boolean {
  const { receipt, signingKey } = params;
  if (receipt.schemaVersion !== 1 || receipt.payload.schemaVersion !== 1) {
    return false;
  }
  if (receipt.payload.destination !== 'confidential') {
    return false;
  }
  const canonical = canonicalizeRecord(payloadRecord(receipt.payload));
  const digest = digestCanonical(canonical);
  return verifyDigestSignature(digest, receipt.signature, signingKey);
}

import type { ReceiptSignature, ReceiptSignatureAlgorithm } from './receipt-crypto.js';
import {
  canonicalizeRecord,
  digestCanonical,
  signDigest,
  verifyDigestSignature,
} from './receipt-crypto.js';

export type ConfidentialModelClass =
  | 'inference-small'
  | 'inference-standard'
  | 'inference-large';

export type ConfidentialUsageResult = 'success' | 'reject';

export interface UsageReceiptPayload {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly requestId: string;
  readonly service: 'confidential-compute';
  readonly modelClass: ConfidentialModelClass;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly totalCents: number;
  readonly spentDigest: string;
  readonly billingPeriod: string;
  readonly issuerKeyId: string;
  readonly redeemedAt: string;
  readonly attestationMeasurement: string;
  readonly result: ConfidentialUsageResult;
  readonly residualRisks: readonly string[];
}

export interface UsageReceipt {
  readonly schemaVersion: 1;
  readonly payload: UsageReceiptPayload;
  readonly signature: ReceiptSignature;
}

export interface BuildUsageReceiptParams {
  readonly receiptId: string;
  readonly requestId: string;
  readonly modelClass: ConfidentialModelClass;
  readonly quantity: number;
  readonly unitPriceCents: number;
  readonly spentDigest: string;
  readonly billingPeriod: string;
  readonly issuerKeyId: string;
  readonly redeemedAt: string;
  readonly attestationMeasurement: string;
  readonly result: ConfidentialUsageResult;
  readonly residualRisks?: readonly string[];
  readonly signingKey: Buffer;
  readonly algorithm?: ReceiptSignatureAlgorithm;
}

export interface VerifyUsageReceiptParams {
  readonly receipt: UsageReceipt;
  readonly signingKey: Buffer;
}

export const CONFIDENTIAL_UNIT_PRICE_CENTS: Record<ConfidentialModelClass, number> = {
  'inference-small': 5,
  'inference-standard': 15,
  'inference-large': 50,
};

export const DEFAULT_RESIDUAL_RISKS: readonly string[] = [
  'Side-channel leakage within the attested workload remains possible despite measurement binding.',
  'Relay operators observe source network metadata and opaque envelope timing.',
  'Commerce retains spent digest and coarse class only — not task content.',
];

function payloadRecord(payload: UsageReceiptPayload): Record<string, unknown> {
  return {
    attestationMeasurement: payload.attestationMeasurement,
    billingPeriod: payload.billingPeriod,
    issuerKeyId: payload.issuerKeyId,
    modelClass: payload.modelClass,
    quantity: payload.quantity,
    receiptId: payload.receiptId,
    redeemedAt: payload.redeemedAt,
    requestId: payload.requestId,
    residualRisks: [...payload.residualRisks],
    result: payload.result,
    schemaVersion: payload.schemaVersion,
    service: payload.service,
    spentDigest: payload.spentDigest,
    totalCents: payload.totalCents,
    unitPriceCents: payload.unitPriceCents,
  };
}

export function resolveUnitPriceCents(modelClass: ConfidentialModelClass): number {
  return CONFIDENTIAL_UNIT_PRICE_CENTS[modelClass];
}

export function buildUsageReceipt(params: BuildUsageReceiptParams): UsageReceipt {
  const algorithm = params.algorithm ?? 'hmac-sha256';
  const totalCents = params.unitPriceCents * params.quantity;
  const payload: UsageReceiptPayload = {
    schemaVersion: 1,
    receiptId: params.receiptId,
    requestId: params.requestId,
    service: 'confidential-compute',
    modelClass: params.modelClass,
    quantity: params.quantity,
    unitPriceCents: params.unitPriceCents,
    totalCents,
    spentDigest: params.spentDigest,
    billingPeriod: params.billingPeriod,
    issuerKeyId: params.issuerKeyId,
    redeemedAt: params.redeemedAt,
    attestationMeasurement: params.attestationMeasurement,
    result: params.result,
    residualRisks: params.residualRisks ?? DEFAULT_RESIDUAL_RISKS,
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

export function verifyUsageReceipt(params: VerifyUsageReceiptParams): boolean {
  const { receipt, signingKey } = params;
  if (receipt.schemaVersion !== 1 || receipt.payload.schemaVersion !== 1) {
    return false;
  }
  if (receipt.payload.service !== 'confidential-compute') {
    return false;
  }
  if (receipt.payload.totalCents !== receipt.payload.unitPriceCents * receipt.payload.quantity) {
    return false;
  }
  const canonical = canonicalizeRecord(payloadRecord(receipt.payload));
  const digest = digestCanonical(canonical);
  return verifyDigestSignature(digest, receipt.signature, signingKey);
}

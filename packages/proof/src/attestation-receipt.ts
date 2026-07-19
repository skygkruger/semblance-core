import type { ReceiptSignature, ReceiptSignatureAlgorithm } from './receipt-crypto.js';
import {
  canonicalizeRecord,
  digestCanonical,
  signDigest,
  verifyDigestSignature,
} from './receipt-crypto.js';

export interface AttestationReceiptPayload {
  readonly schemaVersion: 1;
  readonly receiptId: string;
  readonly requestId: string;
  readonly evidenceId: string;
  readonly workloadId: string;
  readonly measurement: string;
  readonly policyVersion: string;
  readonly tcbVersion: string;
  readonly issuerKeyId: string;
  readonly verifiedAt: string;
  readonly validFrom: string;
  readonly validUntil: string;
}

export interface AttestationReceipt {
  readonly schemaVersion: 1;
  readonly payload: AttestationReceiptPayload;
  readonly signature: ReceiptSignature;
}

export interface BuildAttestationReceiptParams {
  readonly receiptId: string;
  readonly requestId: string;
  readonly evidenceId: string;
  readonly workloadId: string;
  readonly measurement: string;
  readonly policyVersion: string;
  readonly tcbVersion: string;
  readonly issuerKeyId: string;
  readonly verifiedAt?: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly signingKey: Buffer;
  readonly algorithm?: ReceiptSignatureAlgorithm;
}

export interface VerifyAttestationReceiptParams {
  readonly receipt: AttestationReceipt;
  readonly signingKey: Buffer;
}

function payloadRecord(payload: AttestationReceiptPayload): Record<string, unknown> {
  return {
    evidenceId: payload.evidenceId,
    issuerKeyId: payload.issuerKeyId,
    measurement: payload.measurement,
    policyVersion: payload.policyVersion,
    receiptId: payload.receiptId,
    requestId: payload.requestId,
    schemaVersion: payload.schemaVersion,
    tcbVersion: payload.tcbVersion,
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
    verifiedAt: payload.verifiedAt,
    workloadId: payload.workloadId,
  };
}

export function buildAttestationReceipt(params: BuildAttestationReceiptParams): AttestationReceipt {
  const algorithm = params.algorithm ?? 'hmac-sha256';
  const payload: AttestationReceiptPayload = {
    schemaVersion: 1,
    receiptId: params.receiptId,
    requestId: params.requestId,
    evidenceId: params.evidenceId,
    workloadId: params.workloadId,
    measurement: params.measurement,
    policyVersion: params.policyVersion,
    tcbVersion: params.tcbVersion,
    issuerKeyId: params.issuerKeyId,
    verifiedAt: params.verifiedAt ?? new Date().toISOString(),
    validFrom: params.validFrom,
    validUntil: params.validUntil,
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

export function verifyAttestationReceipt(params: VerifyAttestationReceiptParams): boolean {
  const { receipt, signingKey } = params;
  if (receipt.schemaVersion !== 1 || receipt.payload.schemaVersion !== 1) {
    return false;
  }
  const canonical = canonicalizeRecord(payloadRecord(receipt.payload));
  const digest = digestCanonical(canonical);
  return verifyDigestSignature(digest, receipt.signature, signingKey);
}

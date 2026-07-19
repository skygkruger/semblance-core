import { createHash, createHmac, sign, timingSafeEqual } from 'node:crypto';
import type { ActionRecord } from '@semblance/kernel';

export type ActionReceiptSignatureAlgorithm = 'hmac-sha256' | 'ed25519';

export interface ActionReceiptPayload {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly state: ActionRecord['state'];
  readonly auditCorrelationId: string;
  readonly auditPendingId?: string;
  readonly payloadHash: string;
  readonly auditChainHeadHash: string | null;
  readonly completedAt: string;
}

export interface ActionReceipt {
  readonly schemaVersion: 1;
  readonly payload: ActionReceiptPayload;
  readonly signature: {
    readonly algorithm: ActionReceiptSignatureAlgorithm;
    readonly value: string;
  };
}

export interface BuildActionReceiptParams {
  readonly record: ActionRecord;
  readonly auditChainHeadHash?: string | null;
  readonly signingKey: Buffer;
  readonly algorithm?: ActionReceiptSignatureAlgorithm;
  readonly completedAt?: string;
}

export interface VerifyActionReceiptParams {
  readonly receipt: ActionReceipt;
  readonly signingKey: Buffer;
}

function canonicalizeReceiptPayload(payload: ActionReceiptPayload): string {
  const ordered: Record<string, unknown> = {
    actionId: payload.actionId,
    actionType: payload.actionType,
    auditChainHeadHash: payload.auditChainHeadHash,
    auditCorrelationId: payload.auditCorrelationId,
    auditPendingId: payload.auditPendingId ?? null,
    completedAt: payload.completedAt,
    payloadHash: payload.payloadHash,
    requestId: payload.requestId,
    schemaVersion: payload.schemaVersion,
    state: payload.state,
  };
  return JSON.stringify(ordered);
}

function digestCanonical(canonical: string): Buffer {
  return createHash('sha256').update(canonical, 'utf8').digest();
}

function signDigest(
  digest: Buffer,
  signingKey: Buffer,
  algorithm: ActionReceiptSignatureAlgorithm,
): string {
  if (algorithm === 'hmac-sha256') {
    return createHmac('sha256', signingKey).update(digest).digest('hex');
  }
  return sign(null, digest, signingKey).toString('hex');
}

export function buildActionReceipt(params: BuildActionReceiptParams): ActionReceipt {
  const algorithm = params.algorithm ?? 'hmac-sha256';
  const completedAt = params.completedAt ?? params.record.updatedAt;
  const payload: ActionReceiptPayload = {
    schemaVersion: 1,
    actionId: params.record.actionId,
    requestId: params.record.requestId,
    actionType: params.record.actionType,
    state: params.record.state,
    auditCorrelationId: params.record.auditCorrelationId,
    auditPendingId: params.record.auditPendingId,
    payloadHash: params.record.payloadHash,
    auditChainHeadHash: params.auditChainHeadHash ?? null,
    completedAt,
  };

  const canonical = canonicalizeReceiptPayload(payload);
  const digest = digestCanonical(canonical);
  const value = signDigest(digest, params.signingKey, algorithm);

  return {
    schemaVersion: 1,
    payload,
    signature: { algorithm, value },
  };
}

export function verifyActionReceipt(params: VerifyActionReceiptParams): boolean {
  const { receipt, signingKey } = params;
  if (receipt.schemaVersion !== 1 || receipt.payload.schemaVersion !== 1) {
    return false;
  }

  const canonical = canonicalizeReceiptPayload(receipt.payload);
  const digest = digestCanonical(canonical);
  const expected = signDigest(digest, signingKey, receipt.signature.algorithm);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(receipt.signature.value, 'hex');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

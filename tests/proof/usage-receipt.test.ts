import { describe, expect, it } from 'vitest';
import {
  buildConfidentialProofBundle,
  buildUsageReceipt,
  verifyConfidentialProofBundle,
  verifyUsageReceipt,
  DEFAULT_RESIDUAL_RISKS,
} from '../../packages/proof/src/index.js';

const SIGNING_KEY = Buffer.from('proof-test-signing-key-32-bytes!!');

describe('usage receipt', () => {
  it('builds and verifies a confidential usage receipt without task history fields', () => {
    const receipt = buildUsageReceipt({
      receiptId: 'usage-1',
      requestId: 'req-1',
      modelClass: 'inference-standard',
      quantity: 1,
      unitPriceCents: 15,
      spentDigest: 'a'.repeat(64),
      billingPeriod: '2026-07',
      issuerKeyId: 'voucher-key',
      redeemedAt: '2026-07-19T00:00:00.000Z',
      attestationMeasurement: 'b'.repeat(64),
      result: 'success',
      signingKey: SIGNING_KEY,
    });

    expect(receipt.payload.totalCents).toBe(15);
    expect(receipt.payload.residualRisks).toEqual(DEFAULT_RESIDUAL_RISKS);
    expect(JSON.stringify(receipt.payload)).not.toMatch(/messages|taskType|subagentId|domain/);
    expect(verifyUsageReceipt({ receipt, signingKey: SIGNING_KEY })).toBe(true);
  });
});

describe('confidential proof bundle', () => {
  it('verifies attestation + usage + disclosure receipts together', () => {
    const bundle = buildConfidentialProofBundle({
      requestId: 'req-proof-1',
      purpose: 'finance.summarize',
      disclosedFieldNames: ['messages', 'maxTokens'],
      disclosedBytes: 512,
      promptContentHash: 'c'.repeat(64),
      responseContentHash: 'd'.repeat(64),
      evidenceId: 'evidence-1',
      workloadId: 'semblance-confidential-inference-v1',
      measurement: 'e'.repeat(64),
      policyVersion: '2026-07-19',
      tcbVersion: '20260719',
      issuerKeyId: 'attestation-key',
      validFrom: '2026-07-19T00:00:00.000Z',
      validUntil: '2026-07-19T01:00:00.000Z',
      modelClass: 'inference-standard',
      quantity: 1,
      spentDigest: 'f'.repeat(64),
      billingPeriod: '2026-07',
      redeemedAt: '2026-07-19T00:05:00.000Z',
      voucherIssuerKeyId: 'voucher-key',
      result: 'success',
      signingKey: SIGNING_KEY,
    });

    expect(bundle.disclosure.payload.destination).toBe('confidential');
    expect(bundle.attestation.payload.measurement).toBe('e'.repeat(64));
    expect(bundle.usage.payload.service).toBe('confidential-compute');
    expect(verifyConfidentialProofBundle({ bundle, signingKey: SIGNING_KEY })).toBe(true);
  });
});

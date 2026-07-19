import { randomBytes } from 'node:crypto';
import type { AttestationReceipt } from './attestation-receipt.js';
import { buildAttestationReceipt, verifyAttestationReceipt } from './attestation-receipt.js';
import type { ConfidentialDisclosureReceipt } from './disclosure-receipt.js';
import {
  buildConfidentialDisclosureReceipt,
  verifyConfidentialDisclosureReceipt,
} from './disclosure-receipt.js';
import type { ReceiptSignature, ReceiptSignatureAlgorithm } from './receipt-crypto.js';
import {
  canonicalizeRecord,
  digestCanonical,
  signDigest,
  verifyDigestSignature,
} from './receipt-crypto.js';
import type { ConfidentialModelClass, ConfidentialUsageResult, UsageReceipt } from './usage-receipt.js';
import {
  buildUsageReceipt,
  resolveUnitPriceCents,
  verifyUsageReceipt,
} from './usage-receipt.js';

export interface ConfidentialProofBundle {
  readonly schemaVersion: 1;
  readonly bundleId: string;
  readonly disclosure: ConfidentialDisclosureReceipt;
  readonly attestation: AttestationReceipt;
  readonly usage: UsageReceipt;
  readonly signature: ReceiptSignature;
}

export interface BuildConfidentialProofBundleParams {
  readonly bundleId?: string;
  readonly requestId: string;
  readonly purpose: string;
  readonly disclosedFieldNames: readonly string[];
  readonly disclosedBytes: number;
  readonly promptContentHash: string;
  readonly responseContentHash: string;
  readonly evidenceId: string;
  readonly workloadId: string;
  readonly measurement: string;
  readonly policyVersion: string;
  readonly tcbVersion: string;
  readonly issuerKeyId: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly modelClass: ConfidentialModelClass;
  readonly quantity: number;
  readonly spentDigest: string;
  readonly billingPeriod: string;
  readonly redeemedAt: string;
  readonly voucherIssuerKeyId: string;
  readonly result: ConfidentialUsageResult;
  readonly signingKey: Buffer;
  readonly algorithm?: ReceiptSignatureAlgorithm;
}

export interface VerifyConfidentialProofBundleParams {
  readonly bundle: ConfidentialProofBundle;
  readonly signingKey: Buffer;
}

function bundleRecord(bundle: Omit<ConfidentialProofBundle, 'signature'>): Record<string, unknown> {
  return {
    attestation: bundle.attestation.payload,
    bundleId: bundle.bundleId,
    disclosure: bundle.disclosure.payload,
    schemaVersion: bundle.schemaVersion,
    usage: bundle.usage.payload,
  };
}

export function buildConfidentialProofBundle(
  params: BuildConfidentialProofBundleParams,
): ConfidentialProofBundle {
  const algorithm = params.algorithm ?? 'hmac-sha256';
  const bundleId = params.bundleId ?? randomBytes(16).toString('hex');
  const receiptId = randomBytes(16).toString('hex');
  const unitPriceCents = resolveUnitPriceCents(params.modelClass);

  const disclosure = buildConfidentialDisclosureReceipt({
    receiptId: `${receiptId}-disclosure`,
    requestId: params.requestId,
    purpose: params.purpose,
    disclosedFieldNames: params.disclosedFieldNames,
    disclosedBytes: params.disclosedBytes,
    promptContentHash: params.promptContentHash,
    responseContentHash: params.responseContentHash,
    signingKey: params.signingKey,
    algorithm,
  });

  const attestation = buildAttestationReceipt({
    receiptId: `${receiptId}-attestation`,
    requestId: params.requestId,
    evidenceId: params.evidenceId,
    workloadId: params.workloadId,
    measurement: params.measurement,
    policyVersion: params.policyVersion,
    tcbVersion: params.tcbVersion,
    issuerKeyId: params.issuerKeyId,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    signingKey: params.signingKey,
    algorithm,
  });

  const usage = buildUsageReceipt({
    receiptId: `${receiptId}-usage`,
    requestId: params.requestId,
    modelClass: params.modelClass,
    quantity: params.quantity,
    unitPriceCents,
    spentDigest: params.spentDigest,
    billingPeriod: params.billingPeriod,
    issuerKeyId: params.voucherIssuerKeyId,
    redeemedAt: params.redeemedAt,
    attestationMeasurement: params.measurement,
    result: params.result,
    signingKey: params.signingKey,
    algorithm,
  });

  const unsigned: Omit<ConfidentialProofBundle, 'signature'> = {
    schemaVersion: 1,
    bundleId,
    disclosure,
    attestation,
    usage,
  };

  const canonical = canonicalizeRecord(bundleRecord(unsigned));
  const digest = digestCanonical(canonical);
  const value = signDigest(digest, params.signingKey, algorithm);

  return {
    ...unsigned,
    signature: { algorithm, value },
  };
}

export function verifyConfidentialProofBundle(
  params: VerifyConfidentialProofBundleParams,
): boolean {
  const { bundle, signingKey } = params;
  if (bundle.schemaVersion !== 1) {
    return false;
  }

  if (!verifyConfidentialDisclosureReceipt({ receipt: bundle.disclosure, signingKey })) {
    return false;
  }
  if (!verifyAttestationReceipt({ receipt: bundle.attestation, signingKey })) {
    return false;
  }
  if (!verifyUsageReceipt({ receipt: bundle.usage, signingKey })) {
    return false;
  }

  const canonical = canonicalizeRecord(bundleRecord(bundle));
  const digest = digestCanonical(canonical);
  return verifyDigestSignature(digest, bundle.signature, signingKey);
}

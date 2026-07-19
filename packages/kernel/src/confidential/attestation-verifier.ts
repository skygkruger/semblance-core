import { createPublicKey, verify } from 'node:crypto';
import {
  CURRENT_MEASUREMENT_POLICY_VERSION,
  getMeasurementPolicy,
  isMeasurementApproved,
  isTcbDowngrade,
} from './measurement-policy.js';
import { attestationSigningPayload } from './attestation-signing-payload.js';
import type {
  AttestationNonceGuard,
  AttestationVerificationContext,
  AttestationVerificationResult,
  ConfidentialAttestationEvidence,
} from './attestation-types.js';

export type {
  AttestationNonceGuard,
  AttestationVerificationContext,
  AttestationVerificationResult,
  ConfidentialAttestationEvidence,
} from './attestation-types.js';

export { attestationSigningPayload } from './attestation-signing-payload.js';

export const DEFAULT_ATTESTATION_ISSUER_KEY_ID = 'semblance-attestation-v1';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const TEST_ATTESTATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATestAttestationKeyPublicForUnitTests0=
-----END PUBLIC KEY-----`;

const PRODUCTION_ATTESTATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAattestationProductionKeyPlaceholder000=
-----END PUBLIC KEY-----`;

const defaultAttestationPublicKeyPem =
  process.env.NODE_ENV === 'test'
    ? TEST_ATTESTATION_PUBLIC_KEY_PEM
    : PRODUCTION_ATTESTATION_PUBLIC_KEY_PEM;

const attestationIssuerPublicKeys = new Map<string, string>([
  [DEFAULT_ATTESTATION_ISSUER_KEY_ID, defaultAttestationPublicKeyPem],
]);

export function setAttestationIssuerPublicKey(keyId: string, pem: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setAttestationIssuerPublicKey is test-only');
  }
  attestationIssuerPublicKeys.set(keyId, pem);
}

export function resetAttestationIssuerPublicKeysForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetAttestationIssuerPublicKeysForTests is test-only');
  }
  attestationIssuerPublicKeys.clear();
  attestationIssuerPublicKeys.set(DEFAULT_ATTESTATION_ISSUER_KEY_ID, TEST_ATTESTATION_PUBLIC_KEY_PEM);
}

function reject(reason: string): AttestationVerificationResult {
  return { allowed: false, reason };
}

function allow(ephemeralPublicKey: string): AttestationVerificationResult {
  return {
    allowed: true,
    reason: 'attestation_verified',
    boundEphemeralPublicKey: ephemeralPublicKey,
  };
}

function decodeEd25519Signature(signature: string): Buffer | null {
  const prefix = 'ed25519:';
  if (!signature.startsWith(prefix)) {
    return null;
  }
  try {
    return Buffer.from(signature.slice(prefix.length), 'base64url');
  } catch {
    return null;
  }
}

function parseCanonicalTimestamp(value: string): number | null {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) {
    return null;
  }
  return ms;
}

function parseEvidence(value: unknown): ConfidentialAttestationEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const requiredStringFields = [
    'evidenceId',
    'nonce',
    'workloadId',
    'measurement',
    'policyVersion',
    'tcbVersion',
    'ephemeralPublicKey',
    'validFrom',
    'validUntil',
    'issuerKeyId',
    'signature',
  ] as const;

  if (record.protocolVersion !== 1) {
    return null;
  }

  for (const field of requiredStringFields) {
    if (typeof record[field] !== 'string' || record[field].trim().length === 0) {
      return null;
    }
  }

  return record as unknown as ConfidentialAttestationEvidence;
}

function verifyAttestationSignature(evidence: ConfidentialAttestationEvidence): boolean {
  const publicKeyPem = attestationIssuerPublicKeys.get(evidence.issuerKeyId);
  if (!publicKeyPem) {
    return false;
  }

  const signatureBytes = decodeEd25519Signature(evidence.signature);
  if (!signatureBytes) {
    return false;
  }

  const { signature: _signature, ...unsigned } = evidence;
  const payload = attestationSigningPayload(unsigned);

  try {
    const publicKey = createPublicKey(publicKeyPem);
    return verify(null, Buffer.from(payload, 'utf8'), publicKey, signatureBytes);
  } catch {
    return false;
  }
}

function validateEphemeralPublicKey(value: string): boolean {
  if (!BASE64URL.test(value)) {
    return false;
  }
  try {
    const bytes = Buffer.from(value, 'base64url');
    return bytes.length === 32;
  } catch {
    return false;
  }
}

export class InMemoryAttestationNonceGuard implements AttestationNonceGuard {
  private readonly seen = new Map<string, number>();

  tryConsume(nonce: string, validUntilMs: number, nowMs: number): boolean {
    this.purgeExpired(nowMs);
    if (this.seen.has(nonce)) {
      return false;
    }
    this.seen.set(nonce, validUntilMs);
    return true;
  }

  purgeExpired(nowMs: number): void {
    for (const [nonce, expiryMs] of this.seen.entries()) {
      if (expiryMs <= nowMs) {
        this.seen.delete(nonce);
      }
    }
  }
}

export function createAttestationNonceGuard(): AttestationNonceGuard {
  return new InMemoryAttestationNonceGuard();
}

export function verifyAttestation(
  evidenceInput: unknown,
  context: AttestationVerificationContext,
): AttestationVerificationResult {
  const evidence = parseEvidence(evidenceInput);
  if (!evidence) {
    return reject('invalid_attestation_evidence');
  }

  if (!SHA256_HEX.test(evidence.measurement)) {
    return reject('invalid_measurement_digest');
  }

  if (!validateEphemeralPublicKey(evidence.ephemeralPublicKey)) {
    return reject('invalid_ephemeral_public_key');
  }

  if (evidence.workloadId !== context.expectedWorkloadId) {
    return reject('wrong_workload_id');
  }

  const expectedPolicyVersion =
    context.expectedPolicyVersion ?? CURRENT_MEASUREMENT_POLICY_VERSION;
  if (evidence.policyVersion !== expectedPolicyVersion) {
    return reject('wrong_policy_version');
  }

  const policy = getMeasurementPolicy(evidence.policyVersion);
  if (!policy) {
    return reject('unknown_policy_version');
  }

  if (!verifyAttestationSignature(evidence)) {
    return reject('bad_attestation_signature');
  }

  const nowMs = context.nowMs ?? Date.now();
  const validFromMs = parseCanonicalTimestamp(evidence.validFrom);
  const validUntilMs = parseCanonicalTimestamp(evidence.validUntil);

  if (validFromMs === null || validUntilMs === null) {
    return reject('invalid_evidence_validity_window');
  }

  if (validUntilMs <= validFromMs) {
    return reject('invalid_evidence_validity_window');
  }

  if (nowMs < validFromMs) {
    return reject('evidence_not_yet_valid');
  }

  if (nowMs >= validUntilMs) {
    return reject('stale_attestation_evidence');
  }

  if (!isMeasurementApproved(evidence.measurement, evidence.policyVersion)) {
    return reject('unknown_measurement');
  }

  if (isTcbDowngrade(evidence.tcbVersion, evidence.policyVersion)) {
    return reject('downgraded_tcb');
  }

  const nonceGuard = context.nonceGuard ?? createAttestationNonceGuard();
  if (!nonceGuard.tryConsume(evidence.nonce, validUntilMs, nowMs)) {
    return reject('replayed_attestation_nonce');
  }

  return allow(evidence.ephemeralPublicKey);
}

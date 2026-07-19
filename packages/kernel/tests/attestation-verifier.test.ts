import { createPrivateKey, sign } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  LICENSE_TEST_PRIVATE_KEY_PEM,
  LICENSE_TEST_PUBLIC_KEY_PEM,
} from '../../../tests/fixtures/license-keys.js';
import {
  CURRENT_MEASUREMENT_POLICY_VERSION,
  resetMeasurementPoliciesForTests,
  setMeasurementPolicyForTests,
} from '../src/confidential/measurement-policy.js';
import {
  DEFAULT_ATTESTATION_ISSUER_KEY_ID,
  createAttestationNonceGuard,
  resetAttestationIssuerPublicKeysForTests,
  setAttestationIssuerPublicKey,
  verifyAttestation,
  type ConfidentialAttestationEvidence,
} from '../src/confidential/attestation-verifier.js';
import { attestationSigningPayload } from '../src/confidential/attestation-signing-payload.js';

const TEST_WORKLOAD_ID = 'semblance-confidential-inference-v1';
const TEST_MEASUREMENT = 'a'.repeat(64);
const TEST_TCB_VERSION = '20260719';
const TEST_NONCE = 'nonce-test-001';
const TEST_EVIDENCE_ID = 'evidence-test-001';
const TEST_EPHEMERAL_PUBLIC_KEY = Buffer.alloc(32, 0xab).toString('base64url');

function signEvidence(
  unsigned: Omit<ConfidentialAttestationEvidence, 'signature'>,
  privateKeyPem = LICENSE_TEST_PRIVATE_KEY_PEM,
): ConfidentialAttestationEvidence {
  const payload = attestationSigningPayload(unsigned);
  const privateKey = createPrivateKey(privateKeyPem);
  const signatureBytes = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return {
    ...unsigned,
    signature: `ed25519:${signatureBytes.toString('base64url')}`,
  };
}

function validUnsignedEvidence(
  overrides: Partial<Omit<ConfidentialAttestationEvidence, 'signature'>> = {},
): Omit<ConfidentialAttestationEvidence, 'signature'> {
  const now = Date.now();
  return {
    protocolVersion: 1,
    evidenceId: TEST_EVIDENCE_ID,
    nonce: TEST_NONCE,
    workloadId: TEST_WORKLOAD_ID,
    measurement: TEST_MEASUREMENT,
    policyVersion: CURRENT_MEASUREMENT_POLICY_VERSION,
    tcbVersion: TEST_TCB_VERSION,
    ephemeralPublicKey: TEST_EPHEMERAL_PUBLIC_KEY,
    validFrom: new Date(now - 60_000).toISOString(),
    validUntil: new Date(now + 60_000).toISOString(),
    issuerKeyId: DEFAULT_ATTESTATION_ISSUER_KEY_ID,
    ...overrides,
  };
}

beforeAll(() => {
  setAttestationIssuerPublicKey(DEFAULT_ATTESTATION_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
  setMeasurementPolicyForTests({
    version: CURRENT_MEASUREMENT_POLICY_VERSION,
    approvedMeasurements: [TEST_MEASUREMENT],
    minimumTcbVersion: TEST_TCB_VERSION,
    effectiveFrom: '2026-07-19T00:00:00.000Z',
  });
});

afterEach(() => {
  resetAttestationIssuerPublicKeysForTests();
  setAttestationIssuerPublicKey(DEFAULT_ATTESTATION_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
  resetMeasurementPoliciesForTests();
  setMeasurementPolicyForTests({
    version: CURRENT_MEASUREMENT_POLICY_VERSION,
    approvedMeasurements: [TEST_MEASUREMENT],
    minimumTcbVersion: TEST_TCB_VERSION,
    effectiveFrom: '2026-07-19T00:00:00.000Z',
  });
});

describe('verifyAttestation', () => {
  it('accepts valid attestation evidence and binds ephemeral public key', () => {
    const evidence = signEvidence(validUnsignedEvidence());
    const nonceGuard = createAttestationNonceGuard();
    const nowMs = Date.now();

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
      nonceGuard,
      nowMs,
    });

    expect(result).toEqual({
      allowed: true,
      reason: 'attestation_verified',
      boundEphemeralPublicKey: TEST_EPHEMERAL_PUBLIC_KEY,
    });
  });

  it('rejects bad signature', () => {
    const evidence = signEvidence(validUnsignedEvidence());
    evidence.signature = 'ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('bad_attestation_signature');
  });

  it('rejects wrong workload id', () => {
    const evidence = signEvidence(validUnsignedEvidence({ workloadId: 'other-workload' }));

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'wrong_workload_id',
    });
  });

  it('rejects stale evidence past validity', () => {
    const nowMs = Date.now();
    const evidence = signEvidence(
      validUnsignedEvidence({
        validFrom: new Date(nowMs - 120_000).toISOString(),
        validUntil: new Date(nowMs - 30_000).toISOString(),
      }),
    );

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
      nowMs,
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'stale_attestation_evidence',
    });
  });

  it('rejects wrong policy version', () => {
    const evidence = signEvidence(
      validUnsignedEvidence({ policyVersion: '2026-01-01' }),
    );

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'wrong_policy_version',
    });
  });

  it('rejects unknown measurement', () => {
    const evidence = signEvidence(
      validUnsignedEvidence({ measurement: 'b'.repeat(64) }),
    );

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'unknown_measurement',
    });
  });

  it('rejects replayed nonce', () => {
    const evidence = signEvidence(validUnsignedEvidence());
    const nonceGuard = createAttestationNonceGuard();
    const context = {
      expectedWorkloadId: TEST_WORKLOAD_ID,
      nonceGuard,
    };

    expect(verifyAttestation(evidence, context).allowed).toBe(true);
    expect(verifyAttestation(evidence, context).allowed).toBe(false);
    expect(verifyAttestation(evidence, context).reason).toBe('replayed_attestation_nonce');
  });

  it('rejects downgraded TCB', () => {
    const evidence = signEvidence(
      validUnsignedEvidence({ tcbVersion: '20260101' }),
    );

    const result = verifyAttestation(evidence, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'downgraded_tcb',
    });
  });

  it('rejects malformed evidence', () => {
    const result = verifyAttestation({ protocolVersion: 2 }, {
      expectedWorkloadId: TEST_WORKLOAD_ID,
    });

    expect(result).toEqual({
      allowed: false,
      reason: 'invalid_attestation_evidence',
    });
  });
});

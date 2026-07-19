import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CONFIDENTIAL_NO_FALLBACK,
  CURRENT_MEASUREMENT_POLICY_VERSION,
  createAttestationNonceGuard,
  decideExecutionDestination,
  resetAttestationIssuerPublicKeysForTests,
  resetMeasurementPoliciesForTests,
  setAttestationIssuerPublicKey,
  setMeasurementPolicyForTests,
  verifyAttestation,
  DEFAULT_ATTESTATION_ISSUER_KEY_ID,
  attestationSigningPayload,
  type ConfidentialAttestationEvidence,
  type ExecutionDestinationPolicyInput,
} from '@semblance/kernel';
import {
  LICENSE_TEST_PRIVATE_KEY_PEM,
  LICENSE_TEST_PUBLIC_KEY_PEM,
} from '../../../tests/fixtures/license-keys.js';
import { CloudBroker } from '../src/broker.js';
import { AttestationClient } from '../src/confidential/attestation-client.js';
import {
  decryptConfidentialResponse,
  encryptConfidentialResponse,
  prepareConfidentialTask,
} from '../src/confidential/task-crypto.js';
import type {
  ExecutionRequest,
  GatewayOpaqueTransport,
  LocalExecutionTransport,
} from '../src/types.js';

const TEST_WORKLOAD_ID = 'semblance-confidential-inference-v1';
const TEST_MEASUREMENT = 'c'.repeat(64);
const TEST_TCB_VERSION = '20260719';
const TEST_NONCE = 'confidential-nonce-001';
const TEST_EVIDENCE_ID = 'confidential-evidence-001';

const workloadKeys = generateKeyPairSync('x25519');

function exportRawX25519PublicKey(publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  return jwk.x;
}

const WORKLOAD_EPHEMERAL_PUBLIC_KEY = exportRawX25519PublicKey(workloadKeys.publicKey);

function signEvidence(
  unsigned: Omit<ConfidentialAttestationEvidence, 'signature'>,
): ConfidentialAttestationEvidence {
  const payload = attestationSigningPayload(unsigned);
  const privateKey = createPrivateKey(LICENSE_TEST_PRIVATE_KEY_PEM);
  const signatureBytes = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return {
    ...unsigned,
    signature: `ed25519:${signatureBytes.toString('base64url')}`,
  };
}

function validEvidence(
  overrides: Partial<Omit<ConfidentialAttestationEvidence, 'signature'>> = {},
): ConfidentialAttestationEvidence {
  const now = Date.now();
  return signEvidence({
    protocolVersion: 1,
    evidenceId: TEST_EVIDENCE_ID,
    nonce: TEST_NONCE,
    workloadId: TEST_WORKLOAD_ID,
    measurement: TEST_MEASUREMENT,
    policyVersion: CURRENT_MEASUREMENT_POLICY_VERSION,
    tcbVersion: TEST_TCB_VERSION,
    ephemeralPublicKey: WORKLOAD_EPHEMERAL_PUBLIC_KEY,
    validFrom: new Date(now - 60_000).toISOString(),
    validUntil: new Date(now + 60_000).toISOString(),
    issuerKeyId: DEFAULT_ATTESTATION_ISSUER_KEY_ID,
    ...overrides,
  });
}

function basePolicy(overrides: Partial<ExecutionDestinationPolicyInput> = {}): ExecutionDestinationPolicyInput {
  return {
    sensitivity: 20,
    localFeasibility: true,
    destinationTrust: {
      byo: 'verified',
      selfHosted: 'verified',
      confidential: 'attested',
    },
    userPreference: 'confidential',
    disclosureCeiling: 80,
    attestationAvailable: true,
    localOnlyKillSwitch: false,
    explicitConsent: true,
    ...overrides,
  };
}

function baseRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    requestId: 'conf-req-1',
    messages: [{ role: 'user', content: 'Summarize quarterly budget' }],
    maxTokens: 512,
    temperature: 0.5,
    subagentId: 'sub-conf',
    domain: 'finance',
    taskType: 'summarize',
    policyInput: basePolicy(),
    excludedCategories: [],
    model: 'confidential-default',
    attestationEvidence: validEvidence(),
    ...overrides,
  };
}

function createAttestationClient(nonceGuard = createAttestationNonceGuard()): AttestationClient {
  return new AttestationClient({
    fetcher: {
      fetchEvidence: vi.fn(async () => validEvidence()),
    },
    verifier: verifyAttestation,
    expectedWorkloadId: TEST_WORKLOAD_ID,
    nonceGuard,
  });
}

const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');

function deriveAesKey(sharedSecret: Buffer): Buffer {
  return createHash('sha256').update(sharedSecret).update('semblance-confidential-v1', 'utf8').digest();
}

function importRawX25519PublicKey(base64url: string) {
  const raw = Buffer.from(base64url, 'base64url');
  return createPublicKey({
    key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

function decryptTaskWithWorkload(
  deviceEphemeralPublicKey: string,
  ciphertext: string,
  iv: string,
  authTag: string,
): string {
  const deviceKey = importRawX25519PublicKey(deviceEphemeralPublicKey);
  const sharedSecret = diffieHellman({ publicKey: deviceKey, privateKey: workloadKeys.privateKey });
  const aesKey = deriveAesKey(sharedSecret);
  sharedSecret.fill(0);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function deriveResponseAesKey(deviceEphemeralPublicKey: string): Buffer {
  const deviceKey = importRawX25519PublicKey(deviceEphemeralPublicKey);
  const sharedSecret = diffieHellman({ publicKey: deviceKey, privateKey: workloadKeys.privateKey });
  const aesKey = deriveAesKey(sharedSecret);
  sharedSecret.fill(0);
  return aesKey;
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

describe('confidential task crypto', () => {
  it('encrypt/decrypt roundtrip with mock workload key', () => {
    const prepared = prepareConfidentialTask({
      messages: [{ role: 'user', content: 'hello confidential' }],
      excludedCategories: [],
      maxDisclosureBytes: 8192,
      workloadEphemeralPublicKey: WORKLOAD_EPHEMERAL_PUBLIC_KEY,
      maxTokens: 128,
      temperature: 0.2,
      subagentId: 'sub-1',
      domain: 'chat',
      taskType: 'reasoning',
    });

    expect('ok' in prepared).toBe(false);

    const plaintextJson = decryptTaskWithWorkload(
      prepared.deviceEphemeralPublicKey,
      prepared.ciphertext,
      prepared.iv,
      prepared.authTag,
    );
    expect(JSON.parse(plaintextJson).messages[0].content).toContain('hello confidential');

    const encryptedResponse = encryptConfidentialResponse(
      prepared.sessionMaterial.aesKey,
      'confidential answer',
    );
    const decrypted = decryptConfidentialResponse(prepared.sessionMaterial, encryptedResponse);
    expect(decrypted.content).toBe('confidential answer');
  });

  it('enforces maxDisclosureBytes', () => {
    const huge = 'x'.repeat(20_000);
    const result = prepareConfidentialTask({
      messages: [{ role: 'user', content: huge }],
      excludedCategories: [],
      maxDisclosureBytes: 512,
      workloadEphemeralPublicKey: WORKLOAD_EPHEMERAL_PUBLIC_KEY,
      maxTokens: 128,
      temperature: 0.2,
      subagentId: 'sub-1',
      domain: 'chat',
      taskType: 'reasoning',
    });

    expect(result).toEqual({ ok: false, reason: 'max_disclosure_bytes_exceeded' });
  });
});

describe('CloudBroker confidential destination', () => {
  let localTransport: LocalExecutionTransport;
  let gatewayTransport: GatewayOpaqueTransport;
  let nonceGuard: ReturnType<typeof createAttestationNonceGuard>;

  beforeEach(() => {
    nonceGuard = createAttestationNonceGuard();

    localTransport = {
      execute: vi.fn(async () => ({
        content: 'local answer',
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
        model: 'local',
        provider: 'local',
      })),
    };

    gatewayTransport = {
      execute: vi.fn(async () => {
        throw new Error('BYO execute must not be called for confidential destination');
      }),
      executeConfidential: vi.fn(async (request) => {
        const plaintextJson = decryptTaskWithWorkload(
          request.deviceEphemeralPublicKey,
          request.ciphertext,
          request.iv,
          request.authTag,
        );
        const payload = JSON.parse(plaintextJson) as { messages: Array<{ content: string }> };
        const prompt = payload.messages[0]?.content ?? '';
        const aesKey = deriveResponseAesKey(request.deviceEphemeralPublicKey);
        const encrypted = encryptConfidentialResponse(aesKey, `confidential: ${prompt}`);
        aesKey.fill(0);

        return {
          ...encrypted,
          tokensUsed: { prompt: 4, completion: 8, total: 12 },
          model: request.model,
          provider: 'confidential',
          responseContentHash: 'd'.repeat(64),
        };
      }),
    };
  });

  it('happy path encrypt/decrypt roundtrip with mock attestation allow', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: createAttestationClient(nonceGuard),
    });

    const result = await broker.execute(baseRequest());

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.destination).toBe('confidential');
      expect(result.content).toContain('confidential:');
      expect(result.provider).toBe('confidential');
    }
    expect(gatewayTransport.executeConfidential).toHaveBeenCalledOnce();
    expect(gatewayTransport.execute).not.toHaveBeenCalled();
    expect(localTransport.execute).not.toHaveBeenCalled();
  });

  it('rejected attestation → no encrypt, no transport call', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: createAttestationClient(nonceGuard),
    });

    const result = await broker.execute(baseRequest({
      attestationEvidence: validEvidence({ measurement: 'b'.repeat(64) }),
    }));

    expect(result.status).toBe('reject');
    if (result.status === 'reject') {
      expect(result.reason).toBe('unknown_measurement');
    }
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
    expect(gatewayTransport.execute).not.toHaveBeenCalled();
    expect(localTransport.execute).not.toHaveBeenCalled();
  });

  it('stale attestation → fail closed', async () => {
    const nowMs = Date.now();
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: new AttestationClient({
        fetcher: { fetchEvidence: async () => validEvidence({
          validFrom: new Date(nowMs - 120_000).toISOString(),
          validUntil: new Date(nowMs - 30_000).toISOString(),
        }) },
        verifier: (evidence, context) => verifyAttestation(evidence, { ...context, nowMs }),
        expectedWorkloadId: TEST_WORKLOAD_ID,
        nonceGuard,
      }),
    });

    const result = await broker.execute(baseRequest({
      attestationEvidence: validEvidence({
        validFrom: new Date(nowMs - 120_000).toISOString(),
        validUntil: new Date(nowMs - 30_000).toISOString(),
      }),
    }));

    expect(result.status).toBe('reject');
    if (result.status === 'reject') {
      expect(result.reason).toBe('stale_attestation_evidence');
    }
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
  });

  it('maxDisclosureBytes enforcement rejects before transport', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: createAttestationClient(nonceGuard),
    });

    const result = await broker.execute(baseRequest({
      messages: [{ role: 'user', content: 'z'.repeat(20_000) }],
      maxDisclosureBytes: 256,
    }));

    expect(result.status).toBe('reject');
    if (result.status === 'reject') {
      expect(result.reason).toBe('max_disclosure_bytes_exceeded');
    }
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
  });

  it('no-fallback: confidential destination does not call BYO adapter', async () => {
    expect(CONFIDENTIAL_NO_FALLBACK).toBe(true);

    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: createAttestationClient(nonceGuard),
    });

    await broker.execute(baseRequest({
      attestationEvidence: validEvidence({ signature: 'ed25519:invalid' }),
    }));

    expect(gatewayTransport.execute).not.toHaveBeenCalled();
    expect(localTransport.execute).not.toHaveBeenCalled();
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
  });
});

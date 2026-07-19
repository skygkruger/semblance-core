import {
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  sign,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CloudBudgetStore,
  CONFIDENTIAL_NO_FALLBACK,
  createAttestationNonceGuard,
  createDefaultCloudBudgetDocument,
  decideExecutionDestination,
  resetAttestationIssuerPublicKeysForTests,
  resetMeasurementPoliciesForTests,
  setAttestationIssuerPublicKey,
  setMeasurementPolicyForTests,
  verifyAttestation,
  CURRENT_MEASUREMENT_POLICY_VERSION,
  DEFAULT_ATTESTATION_ISSUER_KEY_ID,
  attestationSigningPayload,
  type ConfidentialAttestationEvidence,
  type ExecutionDestinationPolicyInput,
} from '@semblance/kernel';
import { CloudBroker } from '@semblance/cloud-broker';
import {
  AttestationClient,
  VoucherWallet,
  decryptConfidentialResponse,
  encryptConfidentialResponse,
  prepareConfidentialTask,
} from '@semblance/cloud-broker';
import type {
  ExecutionRequest,
  GatewayOpaqueTransport,
  LocalExecutionTransport,
} from '@semblance/cloud-broker';
import {
  buildConfidentialProofBundle,
  verifyConfidentialProofBundle,
} from '@semblance/proof';
import {
  assertRedemptionStoreHasNoAccountLinkage,
  createMemoryVoucherRedemptionStore,
} from '../../../semblence-representative/infrastructure/commerce-worker/vouchers/redemption.js';
import {
  assertRelayStoreHasNoAccountKeys,
  createMemoryRelayStore,
} from '../../../semblence-representative/infrastructure/privacy-relay/src/index.ts';
import {
  assertWorkloadStoreHasNoAccountKeys,
  createMemoryWorkloadStore,
} from '../../../semblence-representative/infrastructure/confidential-workload/src/index.ts';
import {
  LICENSE_TEST_PRIVATE_KEY_PEM,
  LICENSE_TEST_PUBLIC_KEY_PEM,
} from '../fixtures/license-keys.js';

const TEST_WORKLOAD_ID = 'semblance-confidential-inference-v1';
const TEST_MEASUREMENT = 'c'.repeat(64);
const TEST_TCB_VERSION = '20260719';
const TEST_NONCE = 'slice9-exit-nonce';
const TEST_EVIDENCE_ID = 'slice9-exit-evidence';
const PROOF_KEY = Buffer.from('slice9-confidential-proof-signing-key!!');

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
    requestId: 'slice9-exit-req',
    messages: [{ role: 'user', content: 'Summarize quarterly budget' }],
    maxTokens: 512,
    temperature: 0.5,
    subagentId: 'sub-slice9',
    domain: 'finance',
    taskType: 'summarize',
    policyInput: basePolicy(),
    excludedCategories: [],
    model: 'confidential-default',
    modelClass: 'inference-standard',
    attestationEvidence: validEvidence(),
    ...overrides,
  };
}

function createTestVoucherWallet(): VoucherWallet {
  const wallet = new VoucherWallet();
  wallet.addBatch([
    {
      serial: 'f'.repeat(64),
      coarseClass: 'inference-standard',
      quantity: 1,
      billingPeriod: '2026-07',
      issuerKeyId: 'test-voucher-key',
      signature: 'test-signature',
    },
  ]);
  return wallet;
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

describe('Slice 9 exit gate — attestation fail closed', () => {
  let gatewayTransport: GatewayOpaqueTransport;
  let localTransport: LocalExecutionTransport;
  let nonceGuard: ReturnType<typeof createAttestationNonceGuard>;

  beforeEach(() => {
    nonceGuard = createAttestationNonceGuard();
    localTransport = {
      execute: vi.fn(async () => ({
        content: 'local',
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
        model: 'local',
        provider: 'local',
      })),
    };
    gatewayTransport = {
      execute: vi.fn(async () => {
        throw new Error('BYO must not run for confidential path');
      }),
      executeConfidential: vi.fn(async (request) => {
        const plaintextJson = decryptTaskWithWorkload(
          request.deviceEphemeralPublicKey,
          request.ciphertext,
          request.iv,
          request.authTag,
        );
        expect(plaintextJson.length).toBeGreaterThan(0);
        const deviceKey = importRawX25519PublicKey(request.deviceEphemeralPublicKey);
        const sharedSecret = diffieHellman({ publicKey: deviceKey, privateKey: workloadKeys.privateKey });
        const aesKey = deriveAesKey(sharedSecret);
        sharedSecret.fill(0);
        const encrypted = encryptConfidentialResponse(aesKey, 'slice9 answer');
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

  it('stale/wrong attestation never receives plaintext transport call', async () => {
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: new AttestationClient({
        fetcher: { fetchEvidence: async () => validEvidence({ measurement: 'b'.repeat(64) }) },
        verifier: verifyAttestation,
        expectedWorkloadId: TEST_WORKLOAD_ID,
        nonceGuard,
      }),
      voucherWallet: createTestVoucherWallet(),
      cloudBudgetStore: new CloudBudgetStore(createDefaultCloudBudgetDocument()),
      proofSigningKey: PROOF_KEY,
    });

    const result = await broker.execute(baseRequest({
      attestationEvidence: validEvidence({ measurement: 'b'.repeat(64) }),
    }));

    expect(result.status).toBe('reject');
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
    expect(gatewayTransport.execute).not.toHaveBeenCalled();
  });

  it('no non-attested fallback for confidential destination', async () => {
    expect(CONFIDENTIAL_NO_FALLBACK).toBe(true);
    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: new AttestationClient({
        fetcher: { fetchEvidence: async () => validEvidence({ signature: 'ed25519:invalid' }) },
        verifier: verifyAttestation,
        expectedWorkloadId: TEST_WORKLOAD_ID,
        nonceGuard,
      }),
      voucherWallet: createTestVoucherWallet(),
      cloudBudgetStore: new CloudBudgetStore(createDefaultCloudBudgetDocument()),
      proofSigningKey: PROOF_KEY,
    });

    await broker.execute(baseRequest({
      attestationEvidence: validEvidence({ signature: 'ed25519:invalid' }),
    }));

    expect(gatewayTransport.execute).not.toHaveBeenCalled();
    expect(localTransport.execute).not.toHaveBeenCalled();
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
  });

  it('cloud budget blocks confidential transport before disclosure when disabled', async () => {
    const budgetStore = new CloudBudgetStore(createDefaultCloudBudgetDocument());
    budgetStore.setCloudDisabled(true);

    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport,
      attestationClient: new AttestationClient({
        fetcher: { fetchEvidence: async () => validEvidence() },
        verifier: verifyAttestation,
        expectedWorkloadId: TEST_WORKLOAD_ID,
        nonceGuard,
      }),
      voucherWallet: createTestVoucherWallet(),
      cloudBudgetStore: budgetStore,
      proofSigningKey: PROOF_KEY,
    });

    const result = await broker.execute(baseRequest());
    expect(result.status).toBe('reject');
    if (result.status === 'reject') {
      expect(result.reason).toBe('cloud_disabled_locally');
    }
    expect(gatewayTransport.executeConfidential).not.toHaveBeenCalled();
  });
});

describe('Slice 9 exit gate — gateway ciphertext only', () => {
  it('opaque execution transport rejects plaintext fields on confidential requests', () => {
    const transportSource = readFileSync(
      join(import.meta.dirname, '../../packages/gateway/transports/opaque-execution.ts'),
      'utf8',
    );
    expect(transportSource).toContain('assertConfidentialCiphertextOnly');
    expect(transportSource).toContain('PLAINTEXT_FIELD_BAN');
    expect(transportSource).toContain('confidentialExecutionRequestSchema');
  });
});

describe('Slice 9 exit gate — no account-linked task history across stores', () => {
  it('relay, workload, and commerce redemption stores reject account linkage fields', async () => {
    const relayStore = createMemoryRelayStore();
    relayStore.append({
      timestamp: new Date().toISOString(),
      envelopeId: 'env-1',
      payloadHash: 'a'.repeat(64),
      sourceNetwork: '127.0.0.1',
      direction: 'ingress',
    });
    assertRelayStoreHasNoAccountKeys(relayStore);

    const workloadStore = createMemoryWorkloadStore();
    workloadStore.append({
      timestamp: new Date().toISOString(),
      spentDigest: 'b'.repeat(64),
      coarseClass: 'inference-standard',
      payloadHash: 'c'.repeat(64),
    });
    assertWorkloadStoreHasNoAccountKeys(workloadStore);

    const redemptionStore = createMemoryVoucherRedemptionStore();
    await redemptionStore.putSpent({
      spentDigest: 'd'.repeat(64),
      coarseClass: 'inference-standard',
      quantity: 1,
      billingPeriod: '2026-07',
      redeemedAt: new Date().toISOString(),
    });
    assertRedemptionStoreHasNoAccountLinkage([...redemptionStore.records.values()]);
  });
});

describe('Slice 9 exit gate — local proof receipt verifies', () => {
  it('confidential success path produces verifiable proof bundle', async () => {
    const nonceGuard = createAttestationNonceGuard();

    let capturedProof: ReturnType<typeof buildConfidentialProofBundle> | undefined;

    const gatewayTransport: GatewayOpaqueTransport = {
      execute: vi.fn(async () => {
        throw new Error('unexpected BYO execute');
      }),
      executeConfidential: vi.fn(async (request) => {
        const plaintextJson = decryptTaskWithWorkload(
          request.deviceEphemeralPublicKey,
          request.ciphertext,
          request.iv,
          request.authTag,
        );
        expect(JSON.parse(plaintextJson).messages[0].content).toContain('Summarize');
        const deviceKey = importRawX25519PublicKey(request.deviceEphemeralPublicKey);
        const sharedSecret = diffieHellman({ publicKey: deviceKey, privateKey: workloadKeys.privateKey });
        const aesKey = deriveAesKey(sharedSecret);
        sharedSecret.fill(0);
        const encrypted = encryptConfidentialResponse(aesKey, 'proof answer');
        aesKey.fill(0);
        return {
          ...encrypted,
          tokensUsed: { prompt: 4, completion: 8, total: 12 },
          model: request.model,
          provider: 'confidential',
          responseContentHash: 'e'.repeat(64),
        };
      }),
    };

    const broker = new CloudBroker({
      policyDecider: decideExecutionDestination,
      gatewayTransport,
      localTransport: {
        execute: vi.fn(async () => ({
          content: 'local',
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
          model: 'local',
          provider: 'local',
        })),
      },
      attestationClient: new AttestationClient({
        fetcher: { fetchEvidence: async () => validEvidence() },
        verifier: verifyAttestation,
        expectedWorkloadId: TEST_WORKLOAD_ID,
        nonceGuard,
      }),
      voucherWallet: createTestVoucherWallet(),
      cloudBudgetStore: new CloudBudgetStore(createDefaultCloudBudgetDocument()),
      proofSigningKey: PROOF_KEY,
    });

    const evidence = validEvidence();
    const result = await broker.execute(baseRequest({ attestationEvidence: evidence }));

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      capturedProof = result.confidentialProof;
      expect(capturedProof).toBeDefined();
      expect(verifyConfidentialProofBundle({ bundle: capturedProof!, signingKey: PROOF_KEY })).toBe(true);
      expect(capturedProof!.usage.payload.spentDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(capturedProof!.attestation.payload.measurement).toBe(TEST_MEASUREMENT);
      expect(JSON.stringify(capturedProof!.usage.payload)).not.toMatch(/messages|subagentId|taskType/);
    }
  });

  it('prepareConfidentialTask rejects oversize disclosure before transport', () => {
    const prepared = prepareConfidentialTask({
      messages: [{ role: 'user', content: 'z'.repeat(20_000) }],
      excludedCategories: [],
      maxDisclosureBytes: 256,
      workloadEphemeralPublicKey: WORKLOAD_EPHEMERAL_PUBLIC_KEY,
      maxTokens: 128,
      temperature: 0.2,
      subagentId: 'sub-1',
      domain: 'chat',
      taskType: 'reasoning',
    });
    expect(prepared).toEqual({ ok: false, reason: 'max_disclosure_bytes_exceeded' });
  });
});

import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { signRequest } from '@semblance/core';
import type { ActionType, SignedEntitlementV1 } from '@semblance/core';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PrivacyGuaranteeChecker } from '@semblance/core/privacy/privacy-guarantee-checker.js';
import { buildProofCenterSnapshot } from '@semblance/core/proof-center/index.js';
import {
  createKernelEntitlementSnapshotSource,
  refreshKernelEntitlementSnapshotSource,
} from '@semblance/core/premium/kernel-entitlement-source.js';
import {
  createEntitlementService,
  createMemoryKeyStore,
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  ENTITLEMENT_SNAPSHOT_KEY,
  entitlementSigningPayload,
  setEntitlementIssuerPublicKey,
  verifySignedEntitlementV1,
} from '@semblance/kernel';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { RateLimiter } from '@semblance/gateway/security/rate-limiter.js';
import { AnomalyDetector } from '@semblance/gateway/security/anomaly-detector.js';
import { ServiceRegistry } from '@semblance/gateway/services/registry.js';
import { validateAndExecute, resetReplayProtection, type ValidatorDeps } from '@semblance/gateway/ipc/validator.js';
import { LICENSE_TEST_PRIVATE_KEY_PEM, LICENSE_TEST_PUBLIC_KEY_PEM } from '../fixtures/license-keys.js';

function signTestEntitlement(
  unsigned: Omit<SignedEntitlementV1, 'signature'>,
): SignedEntitlementV1 {
  const payload = entitlementSigningPayload(unsigned);
  const privateKey = createPrivateKey(LICENSE_TEST_PRIVATE_KEY_PEM);
  const signatureBytes = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return {
    ...unsigned,
    signature: `ed25519:${signatureBytes.toString('base64url')}`,
  };
}

describe('Corruption safety adversarial suite', () => {
  let db: Database.Database;
  let auditTrail: AuditTrail;
  let signingKey: Buffer;
  let deps: ValidatorDeps;

  beforeEach(() => {
    resetReplayProtection();
    setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
    db = new Database(':memory:');
    auditTrail = new AuditTrail(db);
    signingKey = randomBytes(32);
    deps = {
      signingKey,
      auditTrail,
      allowlist: new Allowlist(db),
      rateLimiter: new RateLimiter({
        actionLimits: { 'email.send': 5 },
        globalLimit: 20,
        windowMs: 60_000,
      }),
      anomalyDetector: new AnomalyDetector({
        burstThreshold: 10,
        burstWindowMs: 5000,
        maxPayloadBytes: 1_000_000,
      }),
      serviceRegistry: new ServiceRegistry(),
      getAutonomyTier: () => 'alter_ego',
      getPriorApprovalsForCapability: () => 10,
    };
    deps.serviceRegistry.register('email.send', {
      async execute() {
        return { success: true, data: { sent: true } };
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it('detects tampered audit chain, denies external dispatch, and surfaces proof-center recovery messaging', async () => {
    auditTrail.append({
      requestId: 'req-corruption-1',
      timestamp: new Date().toISOString(),
      action: 'email.send',
      direction: 'request',
      status: 'pending',
      payloadHash: 'hash-1',
      signature: 'sig-1',
    });
    auditTrail.append({
      requestId: 'req-corruption-1',
      timestamp: new Date().toISOString(),
      action: 'email.send',
      direction: 'response',
      status: 'success',
      payloadHash: 'hash-1',
      signature: 'sig-1-response',
    });

    const firstEntry = auditTrail.getRecent(1)[0]!;
    db.prepare('UPDATE audit_log SET chain_hash = ? WHERE id = ?').run('TAMPERED_HASH', firstEntry.id);

    const tamperedTrail = new AuditTrail(db);
    const integrity = tamperedTrail.verifyChainIntegrity();
    expect(integrity.valid).toBe(false);

    const proofSnapshot = buildProofCenterSnapshot({
      auditTrail: tamperedTrail,
      actionLifecycleStore: null,
      connectedServices: [],
      executionPolicy: null,
      executionReceipts: [],
      extensionStatus: { configured: false, loaded: false, manifestId: null, manifestHash: null },
      activeModel: { modelId: null, provider: null, inferenceEngine: null },
      entitlement: { active: false, entitlementId: null, tier: null, revocationEpoch: null },
      vouchers: { remainingCount: 0, lastRedeemedAt: null },
      syncDevices: null,
      deletionState: { pendingTombstones: 0, completedDeletions: 0, retentionPolicyId: null, lastExportAt: null },
      measurementPolicy: null,
    });

    const auditProof = proofSnapshot.classes.find((entry) => entry.id === 'action-audit-integrity');
    expect(auditProof?.status).toBe('tampered');
    expect(auditProof?.degradedReason).toContain('Tamper-evident audit chain verification failed');

    const id = 'req-corruption-dispatch';
    const timestamp = new Date().toISOString();
    const action: ActionType = 'email.send';
    const payload = { to: ['user@example.com'], subject: 'Test', body: 'Hello' };
    const signature = signRequest(signingKey, id, timestamp, action, payload);
    const response = await validateAndExecute({
      id,
      timestamp,
      action,
      payload,
      source: 'core',
      signature,
    }, deps);

    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('AUDIT_CHAIN_BROKEN');
    expect(response.error?.message).toContain('external dispatch denied');
  });

  it('fails closed on corrupted entitlement material while local free paths remain available', async () => {
    const keyStore = createMemoryKeyStore();
    await keyStore.set(ENTITLEMENT_SNAPSHOT_KEY, '{not-valid-json');

    const service = createEntitlementService(keyStore, { deviceId: 'device-corrupt-entitlement' });
    const snapshot = await service.getSnapshot();
    expect(snapshot).toBeNull();

    const dbHandle = new Database(':memory:') as unknown as DatabaseHandle;
    const gate = new PremiumGate(dbHandle);
    const source = createKernelEntitlementSnapshotSource();
    gate.setEntitlementSource(source);
    await refreshKernelEntitlementSnapshotSource(source, service);
    expect(gate.isPremium()).toBe(false);

    const tampered = signTestEntitlement({
      schemaVersion: 1,
      entitlementId: 'ent-corrupt-signature',
      memberId: 'member-corrupt',
      tier: 'digital-representative',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: new Date(Date.now() + 35 * 86400000).toISOString(),
      offlineGraceDays: 30,
      revocationEpoch: 0,
      issuerKeyId: DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
    });
    tampered.signature = 'ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const verification = verifySignedEntitlementV1(tampered);
    expect(verification.valid).toBe(false);

    const activation = await service.activate(tampered);
    expect(activation.success).toBe(false);
    expect(gate.isPremium()).toBe(false);

    const guarantees = new PrivacyGuaranteeChecker().check();
    expect(guarantees.length).toBeGreaterThan(0);
    expect(guarantees.every((entry) => entry.status === 'verified')).toBe(true);
  });
});

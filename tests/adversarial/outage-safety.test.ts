import { createPrivateKey, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { SignedEntitlementV1 } from '@semblance/protocol';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PrivacyGuaranteeChecker } from '@semblance/core/privacy/privacy-guarantee-checker.js';
import {
  buildProofCenterSnapshot,
  isProofCenterOfflineAcceptable,
} from '@semblance/core/proof-center/index.js';
import {
  createKernelEntitlementSnapshotSource,
  refreshKernelEntitlementSnapshotSource,
} from '@semblance/core/premium/kernel-entitlement-source.js';
import {
  createEntitlementService,
  createMemoryKeyStore,
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  entitlementSigningPayload,
  setEntitlementIssuerPublicKey,
} from '@semblance/kernel';
import { EgressDeniedError, installEgressGuard } from '@semblance/core/security/egress-guard.js';
import { CommerceTransport } from '@semblance/gateway/services/commerce-transport.js';
import {
  searchDocumentsByQuery,
  type DecryptedVaultEvent,
} from '@semblance/vault/src/index.js';
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

describe('Outage safety adversarial suite', () => {
  afterEach(() => {
    delete process.env.SEMBLANCE_NETWORK_ROLE;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
    installEgressGuard();
  });

  it('keeps premium authority during offline grace when commerce network is unavailable', async () => {
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    const gate = new PremiumGate(db);
    const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'device-outage-grace' });
    const source = createKernelEntitlementSnapshotSource();
    gate.setEntitlementSource(source);

    const entitlement = signTestEntitlement({
      schemaVersion: 1,
      entitlementId: 'ent-outage-grace',
      memberId: 'member-outage-grace',
      tier: 'digital-representative',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: new Date(Date.now() - 2 * 86400000).toISOString(),
      offlineGraceDays: 30,
      revocationEpoch: 0,
      issuerKeyId: DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
    });

    await service.activate(entitlement);
    await refreshKernelEntitlementSnapshotSource(source, service);

    const snapshot = await service.getSnapshot();
    expect(snapshot?.active).toBe(true);
    expect(snapshot?.inGracePeriod).toBe(true);
    expect(gate.isPremium()).toBe(true);
  });

  it('fails commerce transport closed when license worker is unreachable', async () => {
    const auditEntries: Array<{ status: string; metadata?: Record<string, unknown> }> = [];
    const transport = new CommerceTransport({
      auditTrail: {
        append(entry) {
          auditEntries.push({
            status: entry.status,
            metadata: entry.metadata,
          });
        },
      } as never,
      fetchImpl: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as never,
    });

    const waitlist = await transport.submitWaitlist('user@example.com');
    expect(waitlist.success).toBe(false);
    expect(auditEntries.some((entry) => entry.status === 'error')).toBe(true);
    expect(auditEntries.some((entry) => entry.metadata?.commerceOperation === 'commerce.waitlist')).toBe(true);

    await expect(transport.createPortalSession('sem_test_key')).rejects.toThrow('ECONNREFUSED');
    expect(auditEntries.some((entry) => entry.metadata?.commerceOperation === 'commerce.portal_session')).toBe(true);
  });

  it('keeps proof center inspectable offline with explicit degraded connector state', () => {
    const snapshot = buildProofCenterSnapshot({
      auditTrail: null,
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

    expect(isProofCenterOfflineAcceptable(snapshot)).toBe(true);
    expect(snapshot.classes.length).toBeGreaterThan(0);
    expect(snapshot.classes.some((entry) => entry.degradedReason)).toBe(true);
  });

  it('keeps local vault reads and privacy guarantees available with zero network', () => {
    const events: DecryptedVaultEvent[] = [{
      sequence: 1,
      eventId: 'evt-outage-1',
      eventType: 'source_ingested',
      occurredAt: '2026-07-19T12:00:00.000Z',
      sourceRefs: [{
        sourceId: 'src-outage-1',
        sourceType: 'file',
        uri: 'file:///local/outage.txt',
        ingestedAt: '2026-07-19T12:00:00.000Z',
      }],
      sensitivity: 'personal',
      payload: {
        schemaVersion: 1,
        documentId: 'doc-outage-1',
        title: 'Offline outage memo',
        mimeType: 'text/plain',
        sourcePath: '/local/outage.txt',
      },
    }];

    const results = searchDocumentsByQuery(events, 'offline outage');
    expect(results.length).toBe(1);
    expect(results[0]?.documentId).toBe('doc-outage-1');

    const guarantees = new PrivacyGuaranteeChecker().check();
    expect(guarantees.every((entry) => entry.status === 'verified')).toBe(true);
  });

  it('denies Core egress and refuses silent cloud fallback during disconnect', async () => {
    let denied = 0;
    for (let i = 0; i < 5; i += 1) {
      try {
        await fetch(`https://example.com/outage-${i}`);
      } catch (error) {
        if (error instanceof EgressDeniedError) {
          denied += 1;
        }
      }
    }
    expect(denied).toBe(5);
  });
});

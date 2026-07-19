import { createHash } from 'node:crypto';
import { createPrivateKey, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  clearExtensions,
  getDigitalRepresentativeArtifactStatus,
  loadExtensions,
} from '@semblance/core/extensions/loader';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import {
  approveRepresentativeEmailWorkflow,
  createEntitlementGateFromSnapshot,
  createRepresentativeEmailWorkflowStore,
  isRepresentativeEmailWorkflowRestartPersistent,
  reopenRepresentativeEmailWorkflowStores,
  runRepresentativeEmailWorkflow,
  type FollowUpNeed,
  type RepresentativeEmailWorkflowDeps,
} from '@semblance/core/agent/representative-email-workflow';
import { assertAuditPendingBeforeDispatch, AuditTrail } from '@semblance/gateway/audit/trail.js';
import {
  createInMemoryActionLifecycleStore,
  createActionLifecycleStore,
  createEntitlementService,
  createMemoryKeyStore,
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  setEntitlementIssuerPublicKey,
  verifySignedEntitlementV1,
  entitlementSigningPayload,
} from '@semblance/kernel';
import {
  createExtensionSandbox,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  verifySignedArtifactPaths,
} from '@semblance/extension-runner';
import { createSignedFixtureExtension } from '../../packages/extension-runner/tests/fixture-helper.js';
import type { SignedEntitlementV1 } from '@semblance/protocol';
import {
  LICENSE_TEST_PRIVATE_KEY_PEM,
  LICENSE_TEST_PUBLIC_KEY_PEM,
} from '../fixtures/license-keys.js';
import { VALID_TOKEN_SEAT_1 } from '../fixtures/founding-tokens.js';
import releaseManifest from '../../release/release-manifest.json';

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

function makeFollowUp(index: number): FollowUpNeed {
  return {
    followUpId: `followup-slice6-${index}`,
    actionId: `action-slice6-${index}`,
    merchantName: `Merchant ${index}`,
    subject: `Follow-up subject ${index}`,
    to: `support${index}@example.com`,
  };
}

function buildWorkflowDeps(input: {
  entitlement: ReturnType<typeof createEntitlementGateFromSnapshot>;
  followUps: FollowUpNeed[];
  actionStore?: ReturnType<typeof createInMemoryActionLifecycleStore>;
  workflowStore: ReturnType<typeof createRepresentativeEmailWorkflowStore>;
  auditDb?: Database.Database;
  sendResults?: Array<{ success: boolean; data?: unknown }>;
}): RepresentativeEmailWorkflowDeps {
  const actionStore = input.actionStore ?? createInMemoryActionLifecycleStore();
  const auditDb = input.auditDb ?? new Database(':memory:');
  const auditTrail = new AuditTrail(auditDb);
  let sendIndex = 0;

  return {
    entitlement: input.entitlement,
    autonomyTier: 'guardian',
    actionStore,
    workflowStore: input.workflowStore,
    followUpTracker: {
      getDueFollowUps: () => input.followUps,
      getFollowUp: (id) => input.followUps.find((item) => item.followUpId === id) ?? null,
      recordFollowUpSent: () => undefined,
    },
    emailDrafter: {
      draftEmail: async (request) => ({
        to: request.to,
        subject: request.subject,
        body: `Representative draft for ${request.intent}`,
        draftType: request.draftType,
      }),
    },
    logAuditPending: ({ requestId, payloadHash, signature }) =>
      auditTrail.logPending({
        requestId,
        action: 'email.send',
        payloadHash,
        signature,
        estimatedTimeSavedSeconds: 120,
      }),
    assertAuditPendingBeforeDispatch: (auditPendingId, requestId) => {
      assertAuditPendingBeforeDispatch(auditTrail, requestId, auditPendingId);
    },
    executeEmailSend: async () => {
      const result = input.sendResults?.[sendIndex] ?? { success: true, data: { messageId: `smtp-${sendIndex}` } };
      sendIndex += 1;
      return result;
    },
  };
}

describe('Slice 6 exit gate', () => {
  const tempDirs: string[] = [];

  beforeAll(() => {
    setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
  });

  afterEach(() => {
    clearExtensions();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  it('verifies signed DR artifact independently', () => {
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return { id: '@semblance/dr', name: 'Fixture DR', version: '0.1.0' };
}`,
    });

    try {
      const verification = verifySignedArtifactPaths({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
      });
      expect(verification.present).toBe(true);
      expect(verification.valid).toBe(true);
      expect(verification.manifestId).toBeTruthy();
    } finally {
      fixture.cleanup();
    }
  });

  it('fails paid readiness without signed runner artifact', async () => {
    const db = {
      exec: () => undefined,
      prepare: () => ({
        get: () => ({ tier: 'digital-representative', expires_at: null, founding_seat: null }),
        all: () => [],
        run: () => undefined,
      }),
    };
    const gate = new PremiumGate(db as never);
    await loadExtensions();
    const status = getDigitalRepresentativeArtifactStatus();

    expect(gate.isPremium()).toBe(true);
    expect(() =>
      gate.assertDigitalRepresentativeReady({
        artifactPresent: status.configured && status.present,
        artifactValid: status.valid && status.loadedViaRunner,
      }),
    ).toThrow(/artifact/i);
  });

  it('denies ambient fetch/network in extension sandbox', async () => {
    const sandbox = createExtensionSandbox({ allowedWritePaths: [] });
    sandbox.assertFetchBlocked();
    await expect(
      sandbox.run(async () => {
        await fetch('https://example.com');
      }),
    ).rejects.toThrow(/network/i);
  });

  it('rejects reservation JWT for paid entitlement activation', async () => {
    const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'slice6-device' });
    const result = await service.activate(VALID_TOKEN_SEAT_1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Reservation artifacts never grant paid entitlement');
  });

  it('asserts commerce.newSalesEnabled remains false in release manifest', () => {
    expect(releaseManifest.commerce.newSalesEnabled).toBe(false);
  });

  it('accepts kernel-signed test entitlement for execution', () => {
    const entitlement = signTestEntitlement({
      schemaVersion: 1,
      entitlementId: 'ent-slice6-test',
      memberId: 'member-slice6',
      tier: 'digital-representative',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      offlineGraceDays: 30,
      revocationEpoch: 0,
      issuerKeyId: DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
    });
    const verification = verifySignedEntitlementV1(entitlement);
    expect(verification.valid).toBe(true);

    const gate = createEntitlementGateFromSnapshot({
      isPremium: true,
      active: true,
    });
    expect(gate.isExecutionAllowed()).toBe(true);
    expect(gate.isPreviewOnly()).toBe(false);
  });

  it('blocks revoked entitlement from executing workflow', async () => {
    const dir = makeTempDir('slice6-revoked-');
    const dbPath = join(dir, 'actions.db');
    const workflowStore = createRepresentativeEmailWorkflowStore(dbPath);
    const deps = buildWorkflowDeps({
      entitlement: createEntitlementGateFromSnapshot({
        isPremium: true,
        active: false,
      }),
      followUps: [makeFollowUp(1)],
      workflowStore,
    });

    const result = await runRepresentativeEmailWorkflow({}, deps);
    expect(result.status).toBe('preview');
    expect(result.preview).toBe(true);
    expect(deps.entitlement.isExecutionAllowed()).toBe(false);
  });

  it('returns preview-only for free users without sending', async () => {
    const dir = makeTempDir('slice6-free-');
    const dbPath = join(dir, 'actions.db');
    const workflowStore = createRepresentativeEmailWorkflowStore(dbPath);
    const deps = buildWorkflowDeps({
      entitlement: createEntitlementGateFromSnapshot({
        isPremium: false,
        active: false,
      }),
      followUps: [makeFollowUp(1)],
      workflowStore,
    });

    const result = await runRepresentativeEmailWorkflow({}, deps);
    expect(result.status).toBe('preview');
    expect(result.draft?.body).toContain('Representative draft');
    expect(result.actionId).toBeUndefined();
  });

  it('completes three consecutive representative email workflows under test entitlement with audit', async () => {
    const paidGate = createEntitlementGateFromSnapshot({
      isPremium: true,
      active: true,
    });
    const actionStore = createInMemoryActionLifecycleStore();
    const auditDb = new Database(':memory:');
    const workflowDir = makeTempDir('slice6-workflow-');
    const workflowDbPath = join(workflowDir, 'actions.db');
    const workflowStore = createRepresentativeEmailWorkflowStore(workflowDbPath);

    for (let index = 1; index <= 3; index += 1) {
      const deps = buildWorkflowDeps({
        entitlement: paidGate,
        followUps: [makeFollowUp(index)],
        actionStore,
        workflowStore,
        auditDb,
      });

      const proposed = await runRepresentativeEmailWorkflow(
        { followUpId: `followup-slice6-${index}` },
        deps,
      );
      expect(proposed.status).toBe('requires_approval');
      expect(proposed.actionId).toBeTruthy();

      const approved = await approveRepresentativeEmailWorkflow(proposed.workflowId, deps);
      expect(approved.status).toBe('completed');
      expect(approved.outcome?.sentAt).toBeTruthy();

      const auditRecord = actionStore.getRecord(proposed.actionId!);
      expect(auditRecord?.state).toBe('completed');
    }

    auditDb.close();
  });

  it('persists workflow and action state across store reopen', async () => {
    const dir = makeTempDir('slice6-restart-');
    const dbPath = join(dir, 'actions.db');
    const actionDb = new Database(dbPath);
    const actionStore = createActionLifecycleStore(actionDb);
    const workflowStore = createRepresentativeEmailWorkflowStore(dbPath);
    const auditDb = new Database(':memory:');

    const deps = buildWorkflowDeps({
      entitlement: createEntitlementGateFromSnapshot({ isPremium: true, active: true }),
      followUps: [makeFollowUp(99)],
      actionStore,
      workflowStore,
      auditDb,
    });

    const proposed = await runRepresentativeEmailWorkflow({}, deps);
    expect(proposed.status).toBe('requires_approval');
    const before = workflowStore.get(proposed.workflowId);
    expect(before).not.toBeNull();

    actionDb.close();
    auditDb.close();

    const reopened = reopenRepresentativeEmailWorkflowStores(dbPath);
    const after = reopened.workflowStore.get(proposed.workflowId);
    expect(isRepresentativeEmailWorkflowRestartPersistent(before, after)).toBe(true);
    expect(reopened.actionStore.getRecord(proposed.actionId!)).not.toBeNull();
    expect(reopened.actionStore.getRecord(proposed.actionId!)?.state).toBe('proposed');
  });

  it('loads signed artifact through extension runner when configured', async () => {
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return { id: '@semblance/dr', name: 'Fixture DR', version: '0.1.0' };
}`,
    });

    process.env.SEMBLANCE_DR_MANIFEST = fixture.manifestPath;
    process.env.SEMBLANCE_DR_ARTIFACT = fixture.artifactPath;

    try {
      const extensions = await loadExtensions({
        runnerClients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient({
            active: true,
            tier: 'digital-representative',
            validUntil: null,
            seat: null,
          }),
        },
      });
      const status = getDigitalRepresentativeArtifactStatus();
      expect(status.valid).toBe(true);
      expect(status.loadedViaRunner).toBe(true);
      expect(extensions).toHaveLength(1);
    } finally {
      fixture.cleanup();
      delete process.env.SEMBLANCE_DR_MANIFEST;
      delete process.env.SEMBLANCE_DR_ARTIFACT;
    }
  });

  it('documents representative repo prove-pack/typecheck evidence path', () => {
    const evidencePath = join(
      process.cwd(),
      '..',
      'semblence-representative',
      'docs',
      'release-manifests',
      'evidence',
      'slice-6',
      'representative',
      'prove-pack.txt',
    );
    expect(() => readFileSync(evidencePath, 'utf8')).not.toThrow();
    const contents = readFileSync(evidencePath, 'utf8');
    expect(contents).toMatch(/prove-pack|typecheck/i);
  });
});

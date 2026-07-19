import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signRequest } from '@semblance/core';
import type { ActionType } from '@semblance/core';
import { AuditTrail, assertAuditPendingBeforeDispatch } from '@semblance/gateway/audit/trail.js';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { RateLimiter } from '@semblance/gateway/security/rate-limiter.js';
import { AnomalyDetector } from '@semblance/gateway/security/anomaly-detector.js';
import { ServiceRegistry } from '@semblance/gateway/services/registry.js';
import { validateAndExecute, resetReplayProtection, type ValidatorDeps } from '@semblance/gateway/ipc/validator.js';
import {
  applyTransition,
  createInMemoryActionLifecycleStore,
  executeAuditedAction,
  reconcileUnknownAction,
  ActionReconcileBlockedError,
} from '@semblance/kernel';
import {
  buildActionReceipt,
  getActionReceipt,
  listWorkActions,
  verifyActionReceipt,
} from '@semblance/proof';
import {
  bootstrapLocalVault,
  createEventLog,
  ingestCalendarEventsToVault,
  ingestEmailMessagesToVault,
  listVaultConnectedSources,
  readDecryptedEvents,
  VaultChatGroundingImpl,
  type ConnectorCalendarEventInput,
  type ConnectorEmailMessageInput,
} from '@semblance/vault/src/index.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T20:00:00.000Z');
const DEVICE_ID = 'device-slice5-exit-gate';
const PRINCIPAL_ID = 'principal-slice5-exit-gate';
const ACCOUNT_ID = 'acct-user@example.com';

function buildEmailFixtures(count: number): ConnectorEmailMessageInput[] {
  return Array.from({ length: count }, (_, index) => ({
    messageId: `slice5-msg-${String(index + 1).padStart(3, '0')}`,
    threadId: `slice5-thread-${index + 1}`,
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'User', address: ACCOUNT_ID }],
    subject: `Slice 5 fixture subject ${index + 1}`,
    date: new Date(Date.parse('2026-07-01T12:00:00.000Z') + index * 60_000).toISOString(),
    body: { text: `Slice 5 fixture body ${index + 1}` },
    flags: ['\\Seen'],
    attachments: [],
  }));
}

function buildCalendarFixtures(count: number): ConnectorCalendarEventInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `slice5-evt-${String(index + 1).padStart(3, '0')}`,
    calendarId: 'primary',
    title: `Slice 5 fixture event ${index + 1}`,
    description: `Description ${index + 1}`,
    startTime: new Date(Date.parse('2026-07-10T09:00:00.000Z') + index * 3_600_000).toISOString(),
    endTime: new Date(Date.parse('2026-07-10T10:00:00.000Z') + index * 3_600_000).toISOString(),
    location: 'Remote',
    attendees: [{ name: 'User', email: ACCOUNT_ID, status: 'accepted' }],
    organizer: { name: 'Organizer', email: 'organizer@example.com' },
    status: 'confirmed' as const,
    lastModified: new Date(Date.parse('2026-07-09T08:00:00.000Z') + index * 60_000).toISOString(),
  }));
}

describe('Slice 5 exit gate', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
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

  it('ingests ≥50 email messages and ≥10 calendar events into vault', () => {
    const dir = makeTempDir('slice5-vault-ingest-');
    const db = new Database(join(dir, 'vault-events.db'));
    const log = createEventLog({
      db,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });

    const emailResult = ingestEmailMessagesToVault({
      messages: buildEmailFixtures(50),
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });
    const calendarResult = ingestCalendarEventsToVault({
      events: buildCalendarFixtures(10),
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });

    expect(emailResult.ingested).toBeGreaterThanOrEqual(50);
    expect(calendarResult.ingested).toBeGreaterThanOrEqual(10);

    const grant = {
      schemaVersion: 1 as const,
      capabilityId: 'cap-slice5-exit',
      principalId: PRINCIPAL_ID,
      deviceId: DEVICE_ID,
      processId: 'core-slice5',
      sessionId: 'session-slice5',
      processType: 'core' as const,
      extensionInstanceId: null,
      workflowId: 'wf-slice5',
      consentReceiptId: 'receipt-slice5',
      executionDestination: 'local' as const,
      resource: 'vault' as const,
      operations: ['vault.read'] as const,
      purpose: 'Slice 5 exit gate',
      dataScope: {
        domains: ['documents', 'email', 'calendar'],
        accounts: [ACCOUNT_ID],
        sources: ['gmail', 'google_calendar'],
        recordClasses: ['event'],
      },
      constraints: {
        domains: ['documents', 'email', 'calendar'],
        resultLimit: 200,
        sensitivityCeiling: 'restricted' as const,
      },
      issuedAt: '2026-07-18T13:00:00.000Z',
      expiresAt: '2026-07-18T23:00:00.000Z',
      policyEpoch: 3,
      revocationEpoch: 0,
      auditCorrelationId: 'audit-slice5-exit',
      signature: 'ed25519:cap-signature',
    };

    const decrypted = readDecryptedEvents({
      reader: log.reader,
      grant,
      principalId: PRINCIPAL_ID,
      nowMs: NOW_MS,
    });

    const emailSources = listVaultConnectedSources(decrypted, 'email');
    const calendarSources = listVaultConnectedSources(decrypted, 'calendar');
    expect(emailSources.length).toBeGreaterThanOrEqual(50);
    expect(calendarSources.length).toBeGreaterThanOrEqual(10);

    db.close();
  });

  it('grounds chat retrieval on vault email and calendar sources', async () => {
    const dataDir = makeTempDir('slice5-grounding-vault-');
    const vault = bootstrapLocalVault({ dataDir, deviceId: DEVICE_ID });

    ingestEmailMessagesToVault({
      messages: buildEmailFixtures(5),
      accountId: ACCOUNT_ID,
      eventLog: vault.eventLog,
      deviceId: DEVICE_ID,
      membershipEpoch: 1,
    });
    ingestCalendarEventsToVault({
      events: buildCalendarFixtures(2),
      accountId: ACCOUNT_ID,
      eventLog: vault.eventLog,
      deviceId: DEVICE_ID,
      membershipEpoch: 1,
    });

    const grounding = new VaultChatGroundingImpl({
      eventLog: vault.eventLog,
      principalId: PRINCIPAL_ID,
      deviceId: DEVICE_ID,
      clock: () => NOW_MS,
    });

    const emailRetrieval = await grounding.retrieve('fixture subject', 5);
    const calendarRetrieval = await grounding.retrieve('fixture event', 5);
    expect(emailRetrieval.chunks.some((chunk) => chunk.sourceId.startsWith('email:'))).toBe(true);
    expect(calendarRetrieval.chunks.some((chunk) => chunk.sourceId.startsWith('calendar:'))).toBe(true);

    vault.close();
  });

  it('returns requires_approval for Guardian email.send without adapter execute', async () => {
    resetReplayProtection();
    const db = new Database(':memory:');
    const signingKey = randomBytes(32);
    let executed = false;

    const deps: ValidatorDeps = {
      signingKey,
      auditTrail: new AuditTrail(db),
      allowlist: new Allowlist(db),
      rateLimiter: new RateLimiter(),
      anomalyDetector: new AnomalyDetector(),
      serviceRegistry: new ServiceRegistry(),
      actionLifecycleStore: createInMemoryActionLifecycleStore(),
      getAutonomyTier: () => 'guardian',
      getPriorApprovalsForCapability: () => 0,
    };

    deps.serviceRegistry.register('email.send', {
      async execute() {
        executed = true;
        return { success: true, data: { sent: true } };
      },
    });

    const id = 'req-slice5-guardian';
    const timestamp = new Date().toISOString();
    const action: ActionType = 'email.send';
    const payload = {
      to: ['user@example.com'],
      subject: 'Slice 5 guardian',
      body: 'Requires approval',
    };
    const signature = signRequest(signingKey, id, timestamp, action, payload);

    const response = await validateAndExecute(
      { id, timestamp, action, payload, source: 'core', signature },
      deps,
    );

    expect(response.status).toBe('requires_approval');
    expect(response.error?.code).toBe('AUTONOMY_REQUIRES_APPROVAL');
    expect(executed).toBe(false);

    db.close();
  });

  it('asserts audit pending exists before dispatch', () => {
    const db = new Database(':memory:');
    const auditTrail = new AuditTrail(db);
    const pendingId = auditTrail.logPending({
      requestId: 'req-slice5-audit',
      action: 'email.send',
      payloadHash: 'hash-slice5-audit',
      signature: 'sig-slice5-audit',
    });

    expect(() => assertAuditPendingBeforeDispatch(auditTrail, 'req-slice5-audit', pendingId)).not.toThrow();
    db.close();
  });

  it('marks injected dispatch timeout as unknown', async () => {
    const store = createInMemoryActionLifecycleStore();
    const auditDb = new Database(':memory:');
    const auditTrail = new AuditTrail(auditDb);

    const result = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-slice5-timeout',
      requestId: 'req-slice5-timeout',
      actionType: 'email.send',
      payloadHash: 'hash-slice5-timeout',
      auditCorrelationId: 'audit-slice5-timeout',
      dispatchTimeoutMs: 5,
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-slice5-timeout',
        action: 'email.send',
        payloadHash: 'hash-slice5-timeout',
        signature: 'sig-slice5-timeout',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-slice5-timeout', auditPendingId);
      },
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { success: true, data: { sent: true } };
      },
    });

    expect(result.record.state).toBe('unknown');
    expect(result.execution.timedOut).toBe(true);
    auditDb.close();
  });

  it('reconcile prevents duplicate send when external confirmation exists', async () => {
    const store = createInMemoryActionLifecycleStore();
    const auditDb = new Database(':memory:');
    const auditTrail = new AuditTrail(auditDb);

    const timeoutResult = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-slice5-reconcile',
      requestId: 'req-slice5-reconcile',
      actionType: 'email.send',
      payloadHash: 'hash-slice5-reconcile',
      auditCorrelationId: 'audit-slice5-reconcile',
      dispatchTimeoutMs: 1,
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-slice5-reconcile',
        action: 'email.send',
        payloadHash: 'hash-slice5-reconcile',
        signature: 'sig-slice5-reconcile',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-slice5-reconcile', auditPendingId);
      },
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { success: true, data: { sent: true } };
      },
    });
    expect(timeoutResult.record.state).toBe('unknown');

    const executeSpy = vi.fn(async () => ({ success: true, data: { sent: true } }));
    const result = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-slice5-reconcile',
      requestId: 'req-slice5-reconcile',
      actionType: 'email.send',
      payloadHash: 'hash-slice5-reconcile',
      auditCorrelationId: 'audit-slice5-reconcile',
      externalChecker: {
        checkExternalConfirmation: async () => ({
          confirmed: true,
          externalId: 'smtp-slice5-999',
        }),
        checkPriorCompletion: async () => ({ confirmed: false }),
      },
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-slice5-reconcile',
        action: 'email.send',
        payloadHash: 'hash-slice5-reconcile',
        signature: 'sig-slice5-reconcile-2',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-slice5-reconcile', auditPendingId);
      },
      execute: executeSpy,
    });

    expect(result.record.state).toBe('completed');
    expect(result.execution.data).toEqual({
      reconciled: true,
      externalConfirmationId: 'smtp-slice5-999',
    });
    expect(executeSpy).not.toHaveBeenCalled();
    auditDb.close();
  });

  it('blocks duplicate send when reconciler rejects redispatch', async () => {
    const unknownRecord = {
      actionId: 'action-slice5-blocked',
      requestId: 'req-slice5-blocked',
      actionType: 'email.send',
      state: 'unknown' as const,
      idempotencyKey: 'idem-slice5-blocked',
      auditCorrelationId: 'audit-slice5-blocked',
      payloadHash: 'hash-slice5-blocked',
      createdAt: '2026-07-18T20:00:00.000Z',
      updatedAt: '2026-07-18T20:00:00.000Z',
    };

    await expect(reconcileUnknownAction(unknownRecord, {
      checkExternalConfirmation: async () => ({
        confirmed: false,
        reason: 'duplicate_send_blocked',
      }),
      checkPriorCompletion: async () => ({ confirmed: false }),
    })).rejects.toThrow(ActionReconcileBlockedError);
  });

  it('builds proof receipt and exposes completed action via listWorkActions', () => {
    const store = createInMemoryActionLifecycleStore();
    const auditDb = new Database(':memory:');
    const auditTrail = new AuditTrail(auditDb);
    const signingKey = randomBytes(32);

    const record = store.createAction({
      actionId: 'action-slice5-proof',
      requestId: 'req-slice5-proof',
      actionType: 'email.send',
      idempotencyKey: 'idem-slice5-proof',
      auditCorrelationId: 'audit-slice5-proof',
      payloadHash: 'hash-slice5-proof',
      initialState: 'approved',
    });
    const completed = applyTransition(
      applyTransition(record, 'dispatch', { auditPendingId: 'pending-slice5-proof' }),
      'complete',
      {
        undoToken: 'undo:action-slice5-proof:test',
        undoExpiresAt: '2026-07-18T20:01:00.000Z',
      },
    );
    store.updateRecord(completed);

    auditTrail.logPending({
      requestId: completed.requestId,
      action: completed.actionType,
      payloadHash: completed.payloadHash,
      signature: 'sig-slice5-proof',
    });
    auditTrail.append({
      requestId: completed.requestId,
      timestamp: completed.updatedAt,
      action: completed.actionType,
      direction: 'response',
      status: 'success',
      payloadHash: completed.payloadHash,
      signature: 'sig-slice5-proof-response',
    });

    const receipt = getActionReceipt({
      store,
      auditTrail,
      actionId: completed.actionId,
      signingKey,
    });
    expect(verifyActionReceipt({ receipt, signingKey })).toBe(true);
    expect(buildActionReceipt({ record: completed, signingKey }).payload.actionId).toBe(completed.actionId);

    const listed = listWorkActions({ store });
    expect(listed.some((action) => action.actionId === completed.actionId && action.state === 'completed')).toBe(true);

    auditDb.close();
  });
});

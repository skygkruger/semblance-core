import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditTrail, assertAuditPendingBeforeDispatch, AuditPendingMissingError } from '@semblance/gateway/audit/trail.js';
import {
  applyTransition,
  isLegalTransition,
  listAllEvents,
  listAllStates,
  listLegalEvents,
  nextState,
} from '../src/actions/state-machine.js';
import {
  createInMemoryActionLifecycleStore,
  type ActionLifecycleStore,
} from '../src/actions/idempotency-store.js';
import {
  applyReconcileOutcome,
  reconcileUnknownAction,
  type ExternalConfirmationChecker,
} from '../src/actions/reconciler.js';
import { executeAuditedAction } from '../src/actions/lifecycle.js';
import {
  ActionReconcileBlockedError,
  IllegalActionTransitionError,
  REVERSIBLE_ACTION_TYPES,
  type ActionRecord,
  type ActionEvent,
  type ActionState,
} from '../src/actions/types.js';

function makeRecord(overrides: Partial<ActionRecord> = {}): ActionRecord {
  const now = '2026-07-18T20:00:00.000Z';
  return {
    actionId: 'action-001',
    requestId: 'req-001',
    actionType: 'email.send',
    state: 'proposed',
    idempotencyKey: 'idem-001',
    auditCorrelationId: 'audit-001',
    payloadHash: 'hash-001',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('action state machine', () => {
  const legalPairs: Array<[ActionState, ActionEvent, ActionState]> = [
    ['proposed', 'approve', 'approved'],
    ['proposed', 'reject', 'rejected'],
    ['approved', 'dispatch', 'dispatched'],
    ['dispatched', 'complete', 'completed'],
    ['dispatched', 'fail', 'failed'],
    ['dispatched', 'timeout', 'unknown'],
    ['unknown', 'reconcile_complete', 'completed'],
    ['unknown', 'reconcile_fail', 'failed'],
    ['unknown', 'reconcile_redispatch', 'dispatched'],
  ];

  it('allows every legal transition', () => {
    for (const [from, event, expected] of legalPairs) {
      expect(isLegalTransition(from, event)).toBe(true);
      expect(nextState(from, event)).toBe(expected);
      const record = makeRecord({ state: from });
      const next = applyTransition(record, event, {
        undoToken: 'undo:test',
        undoExpiresAt: '2026-07-18T20:01:00.000Z',
      });
      expect(next.state).toBe(expected);
    }
  });

  it('rejects every illegal transition', () => {
    for (const from of listAllStates()) {
      for (const event of listAllEvents()) {
        if (isLegalTransition(from, event)) {
          continue;
        }
        expect(() => nextState(from, event)).toThrow(IllegalActionTransitionError);
        expect(() => applyTransition(makeRecord({ state: from }), event)).toThrow(
          IllegalActionTransitionError,
        );
      }
    }
  });

  it('lists legal events per state', () => {
    expect(listLegalEvents('proposed')).toEqual(['approve', 'reject']);
    expect(listLegalEvents('completed')).toEqual([]);
  });
});

describe('action idempotency store', () => {
  let store: ActionLifecycleStore;

  beforeEach(() => {
    store = createInMemoryActionLifecycleStore();
  });

  it('reuses the same action for an idempotency key', () => {
    const first = store.createAction({
      actionId: 'action-a',
      requestId: 'req-a',
      actionType: 'email.send',
      idempotencyKey: 'idem-a',
      auditCorrelationId: 'audit-a',
      payloadHash: 'hash-a',
    });
    const second = store.createAction({
      actionId: 'action-b',
      requestId: 'req-b',
      actionType: 'email.send',
      idempotencyKey: 'idem-a',
      auditCorrelationId: 'audit-b',
      payloadHash: 'hash-b',
    });
    expect(second.actionId).toBe(first.actionId);
    expect(store.getActionIdForKey('idem-a')).toBe('action-a');
  });
});

describe('audited action lifecycle execution', () => {
  let store: ActionLifecycleStore;
  let auditDb: Database.Database;
  let auditTrail: AuditTrail;

  beforeEach(() => {
    store = createInMemoryActionLifecycleStore();
    auditDb = new Database(':memory:');
    auditTrail = new AuditTrail(auditDb);
  });

  afterEach(() => {
    auditDb.close();
  });

  it('marks timeout as unknown', async () => {
    const result = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-timeout',
      requestId: 'req-timeout',
      actionType: 'email.send',
      payloadHash: 'hash-timeout',
      auditCorrelationId: 'audit-timeout',
      dispatchTimeoutMs: 5,
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-timeout',
        action: 'email.send',
        payloadHash: 'hash-timeout',
        signature: 'sig-timeout',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-timeout', auditPendingId);
      },
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { success: true, data: { sent: true } };
      },
    });

    expect(result.record.state).toBe('unknown');
    expect(result.execution.timedOut).toBe(true);
    expect(result.execution.error?.code).toBe('DISPATCH_TIMEOUT');
  });

  it('returns the same action for idempotency key reuse', async () => {
    const params = {
      store,
      idempotencyKey: 'idem-reuse',
      requestId: 'req-reuse',
      actionType: 'email.send',
      payloadHash: 'hash-reuse',
      auditCorrelationId: 'audit-reuse',
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-reuse',
        action: 'email.send',
        payloadHash: 'hash-reuse',
        signature: 'sig-reuse',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId: string) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-reuse', auditPendingId);
      },
      execute: async () => ({ success: true, data: { sent: true } }),
    } as const;

    const first = await executeAuditedAction(params);
    const second = await executeAuditedAction(params);

    expect(second.record.actionId).toBe(first.record.actionId);
    expect(second.record.state).toBe('completed');
    expect(second.execution.data).toEqual({ idempotent: true });
  });

  it('includes reversible metadata on completed reversible actions', async () => {
    expect(REVERSIBLE_ACTION_TYPES.has('email.send')).toBe(true);

    const result = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-reversible',
      requestId: 'req-reversible',
      actionType: 'email.send',
      payloadHash: 'hash-reversible',
      auditCorrelationId: 'audit-reversible',
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-reversible',
        action: 'email.send',
        payloadHash: 'hash-reversible',
        signature: 'sig-reversible',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-reversible', auditPendingId);
      },
      execute: async () => ({ success: true, data: { messageId: 'msg-123' } }),
    });

    expect(result.record.state).toBe('completed');
    expect(result.record.reversible?.reversible).toBe(true);
    expect(result.record.reversible?.undoToken).toMatch(/^undo:/);
    expect(result.record.reversible?.undoExpiresAt).toBeTruthy();
  });

  it('applyReconcileOutcome completes unknown actions', () => {
    const unknown = makeRecord({ state: 'unknown' });
    const reconciled = applyReconcileOutcome(unknown, {
      kind: 'completed',
      externalConfirmationId: 'ext-1',
    });
    expect(reconciled.state).toBe('completed');
    expect(reconciled.externalConfirmationId).toBe('ext-1');
  });

  it('reconcile blocks duplicate send when external confirmation exists', async () => {
    const timeoutResult = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-reconcile',
      requestId: 'req-reconcile',
      actionType: 'email.send',
      payloadHash: 'hash-reconcile',
      auditCorrelationId: 'audit-reconcile',
      dispatchTimeoutMs: 1,
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-reconcile',
        action: 'email.send',
        payloadHash: 'hash-reconcile',
        signature: 'sig-reconcile',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-reconcile', auditPendingId);
      },
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { success: true, data: { sent: true } };
      },
    });
    expect(timeoutResult.record.state).toBe('unknown');

    const stored = store.getRecordByIdempotencyKey('idem-reconcile');
    expect(stored?.state).toBe('unknown');

    const checker: ExternalConfirmationChecker = {
      checkExternalConfirmation: async () => ({
        confirmed: true,
        externalId: 'smtp-msg-999',
      }),
      checkPriorCompletion: async () => ({ confirmed: false }),
    };

    const executeSpy = vi.fn(async () => ({ success: true, data: { sent: true } }));
    const result = await executeAuditedAction({
      store,
      idempotencyKey: 'idem-reconcile',
      requestId: 'req-reconcile',
      actionType: 'email.send',
      payloadHash: 'hash-reconcile',
      auditCorrelationId: 'audit-reconcile',
      externalChecker: checker,
      logAuditPending: () => auditTrail.logPending({
        requestId: 'req-reconcile',
        action: 'email.send',
        payloadHash: 'hash-reconcile',
        signature: 'sig-reconcile-2',
      }),
      assertAuditPendingBeforeDispatch: (auditPendingId) => {
        assertAuditPendingBeforeDispatch(auditTrail, 'req-reconcile', auditPendingId);
      },
      execute: executeSpy,
    });

    expect(result.record?.state).toBe('completed');
    expect(result.execution.data).toEqual({
      reconciled: true,
      externalConfirmationId: 'smtp-msg-999',
    });
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('throws when duplicate send is explicitly blocked by reconciler', async () => {
    const unknownRecord = makeRecord({ state: 'unknown' });
    const checker: ExternalConfirmationChecker = {
      checkExternalConfirmation: async () => ({
        confirmed: false,
        reason: 'duplicate_send_blocked',
      }),
      checkPriorCompletion: async () => ({ confirmed: false }),
    };

    await expect(reconcileUnknownAction(unknownRecord, checker)).rejects.toThrow(
      ActionReconcileBlockedError,
    );
  });
});

describe('audit pending before dispatch', () => {
  let auditDb: Database.Database;
  let auditTrail: AuditTrail;

  beforeEach(() => {
    auditDb = new Database(':memory:');
    auditTrail = new AuditTrail(auditDb);
  });

  afterEach(() => {
    auditDb.close();
  });

  it('requires a durable pending audit entry before dispatch', () => {
    const pendingId = auditTrail.logPending({
      requestId: 'req-audit',
      action: 'email.send',
      payloadHash: 'hash-audit',
      signature: 'sig-audit',
    });

    expect(() => assertAuditPendingBeforeDispatch(auditTrail, 'req-audit', pendingId)).not.toThrow();
    expect(() => assertAuditPendingBeforeDispatch(auditTrail, 'req-audit', 'missing-id')).toThrow(
      AuditPendingMissingError,
    );
  });
});

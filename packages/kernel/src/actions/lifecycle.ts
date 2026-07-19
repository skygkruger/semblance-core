import { randomUUID } from 'node:crypto';
import { applyTransition } from './state-machine.js';
import {
  applyReconcileOutcome,
  reconcileUnknownAction,
  type ExternalConfirmationChecker,
} from './reconciler.js';
import type { ActionLifecycleStore } from './idempotency-store.js';
import type { ActionRecord } from './types.js';

export interface ExecuteAuditedActionParams {
  readonly store: ActionLifecycleStore;
  readonly idempotencyKey: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly payloadHash: string;
  readonly auditCorrelationId: string;
  readonly autoApprove?: boolean;
  readonly approvalReason?: string;
  readonly dispatchTimeoutMs?: number;
  readonly externalChecker?: ExternalConfirmationChecker;
  readonly logAuditPending: () => string;
  readonly assertAuditPendingBeforeDispatch: (auditPendingId: string) => void;
  readonly execute: () => Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }>;
}

export interface ExecuteAuditedActionResult {
  readonly record: ActionRecord;
  readonly execution: {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
    timedOut: boolean;
  };
}

function createUndoMetadata(actionId: string): { undoToken: string; undoExpiresAt: string } {
  return {
    undoToken: `undo:${actionId}:${randomUUID()}`,
    undoExpiresAt: new Date(Date.now() + 30_000).toISOString(),
  };
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn().then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function dispatchAndExecute(
  record: ActionRecord,
  params: ExecuteAuditedActionParams,
): Promise<ExecuteAuditedActionResult> {
  let dispatched = record;
  if (record.state !== 'dispatched') {
    const auditPendingId = params.logAuditPending();
    params.assertAuditPendingBeforeDispatch(auditPendingId);
    dispatched = applyTransition(record, 'dispatch', { auditPendingId });
    params.store.updateRecord(dispatched);
  }

  const timeoutMs = params.dispatchTimeoutMs ?? 30_000;
  const timed = await executeWithTimeout(params.execute, timeoutMs);

  if (timed.timedOut) {
    dispatched = applyTransition(dispatched, 'timeout', {
      failureReason: `Dispatch timed out after ${timeoutMs}ms`,
    });
    params.store.updateRecord(dispatched);
    return {
      record: dispatched,
      execution: {
        success: false,
        error: { code: 'DISPATCH_TIMEOUT', message: dispatched.failureReason ?? 'Dispatch timed out' },
        timedOut: true,
      },
    };
  }

  const execution = timed.value;
  if (execution.success) {
    const undo = createUndoMetadata(dispatched.actionId);
    dispatched = applyTransition(dispatched, 'complete', undo);
    params.store.updateRecord(dispatched);
    return { record: dispatched, execution: { ...execution, timedOut: false } };
  }

  dispatched = applyTransition(dispatched, 'fail', {
    failureReason: execution.error?.message ?? 'Execution failed',
  });
  params.store.updateRecord(dispatched);
  return { record: dispatched, execution: { ...execution, timedOut: false } };
}

export async function executeAuditedAction(
  params: ExecuteAuditedActionParams,
): Promise<ExecuteAuditedActionResult> {
  const existing = params.store.getRecordByIdempotencyKey(params.idempotencyKey);
  if (existing) {
    if (existing.state === 'completed') {
      return {
        record: existing,
        execution: { success: true, data: { idempotent: true }, timedOut: false },
      };
    }
    if (existing.state === 'failed' || existing.state === 'rejected') {
      return {
        record: existing,
        execution: {
          success: false,
          error: {
            code: 'IDEMPOTENT_FAILURE',
            message: existing.failureReason ?? `Action ${existing.actionId} already ${existing.state}`,
          },
          timedOut: false,
        },
      };
    }
    if (existing.state === 'unknown') {
      if (!params.externalChecker) {
        return {
          record: existing,
          execution: {
            success: false,
            error: {
              code: 'ACTION_UNKNOWN',
              message: `Action ${existing.actionId} is unknown and requires reconciliation`,
            },
            timedOut: true,
          },
        };
      }
      const outcome = await reconcileUnknownAction(existing, params.externalChecker);
      if (outcome.kind === 'completed') {
        const reconciled = applyReconcileOutcome(existing, outcome);
        params.store.updateRecord(reconciled);
        return {
          record: reconciled,
          execution: {
            success: true,
            data: { reconciled: true, externalConfirmationId: outcome.externalConfirmationId },
            timedOut: false,
          },
        };
      }
      if (outcome.kind === 'failed') {
        const reconciled = applyReconcileOutcome(existing, outcome);
        params.store.updateRecord(reconciled);
        return {
          record: reconciled,
          execution: {
            success: false,
            error: { code: 'RECONCILE_FAILED', message: outcome.reason },
            timedOut: false,
          },
        };
      }
      const redispatched = applyReconcileOutcome(existing, outcome);
      params.store.updateRecord(redispatched);
      return dispatchAndExecute(redispatched, params);
    }
    if (existing.state === 'proposed') {
      return {
        record: existing,
        execution: {
          success: false,
          error: {
            code: 'REQUIRES_APPROVAL',
            message: existing.failureReason ?? params.approvalReason ?? 'Action requires user approval',
          },
          timedOut: false,
        },
      };
    }
    if (existing.state === 'dispatched' || existing.state === 'approved') {
      return {
        record: existing,
        execution: {
          success: false,
          error: {
            code: 'IDEMPOTENT_IN_PROGRESS',
            message: `Action ${existing.actionId} is ${existing.state}`,
          },
          timedOut: false,
        },
      };
    }
  }

  if (params.autoApprove === false) {
    const actionId = randomUUID();
    const auditPendingId = params.logAuditPending();
    params.assertAuditPendingBeforeDispatch(auditPendingId);

    let record = params.store.createAction({
      actionId,
      requestId: params.requestId,
      actionType: params.actionType,
      idempotencyKey: params.idempotencyKey,
      auditCorrelationId: params.auditCorrelationId,
      payloadHash: params.payloadHash,
      initialState: 'proposed',
    });

    record = {
      ...record,
      auditPendingId,
      failureReason: params.approvalReason ?? 'Action requires user approval',
    };
    params.store.updateRecord(record);

    return {
      record,
      execution: {
        success: false,
        error: {
          code: 'REQUIRES_APPROVAL',
          message: params.approvalReason ?? 'Action requires user approval',
        },
        timedOut: false,
      },
    };
  }

  const actionId = randomUUID();
  let record = params.store.createAction({
    actionId,
    requestId: params.requestId,
    actionType: params.actionType,
    idempotencyKey: params.idempotencyKey,
    auditCorrelationId: params.auditCorrelationId,
    payloadHash: params.payloadHash,
    initialState: 'approved',
  });

  return dispatchAndExecute(record, params);
}

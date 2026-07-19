import { applyTransition } from './state-machine.js';
import {
  ActionReconcileBlockedError,
  type ActionRecord,
} from './types.js';

export interface ExternalConfirmationResult {
  readonly confirmed: boolean;
  readonly externalId?: string;
  readonly reason?: string;
}

export interface ExternalConfirmationChecker {
  checkExternalConfirmation(action: ActionRecord): Promise<ExternalConfirmationResult>;
  checkPriorCompletion(action: ActionRecord): Promise<ExternalConfirmationResult>;
}

export type ReconcileOutcome =
  | { readonly kind: 'completed'; readonly externalConfirmationId: string }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'safe_to_redispatch' };

export async function reconcileUnknownAction(
  record: ActionRecord,
  checker: ExternalConfirmationChecker,
): Promise<ReconcileOutcome> {
  if (record.state !== 'unknown') {
    throw new Error(`Reconcile requires unknown state, got ${record.state}`);
  }

  const priorCompletion = await checker.checkPriorCompletion(record);
  if (priorCompletion.confirmed) {
    return {
      kind: 'completed',
      externalConfirmationId: priorCompletion.externalId ?? record.actionId,
    };
  }

  const externalConfirmation = await checker.checkExternalConfirmation(record);
  if (externalConfirmation.confirmed) {
    return {
      kind: 'completed',
      externalConfirmationId: externalConfirmation.externalId ?? record.actionId,
    };
  }

  if (externalConfirmation.reason === 'duplicate_send_blocked') {
    throw new ActionReconcileBlockedError(
      record.actionId,
      externalConfirmation.reason,
    );
  }

  return { kind: 'safe_to_redispatch' };
}

export function applyReconcileOutcome(
  record: ActionRecord,
  outcome: ReconcileOutcome,
  options: { readonly now?: string } = {},
): ActionRecord {
  switch (outcome.kind) {
    case 'completed':
      return applyTransition(record, 'reconcile_complete', {
        now: options.now,
        externalConfirmationId: outcome.externalConfirmationId,
        undoToken: `undo:${record.actionId}`,
        undoExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      });
    case 'failed':
      return applyTransition(record, 'reconcile_fail', {
        now: options.now,
        failureReason: outcome.reason,
      });
    case 'safe_to_redispatch':
      return applyTransition(record, 'reconcile_redispatch', {
        now: options.now,
      });
  }
}

export function assertSafeToRedispatch(record: ActionRecord): void {
  if (record.state !== 'dispatched') {
    throw new Error(`Redispatch requires dispatched state after reconcile, got ${record.state}`);
  }
}

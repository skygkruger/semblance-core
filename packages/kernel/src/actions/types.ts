export type ActionState =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'unknown';

export type ActionEvent =
  | 'approve'
  | 'reject'
  | 'dispatch'
  | 'complete'
  | 'fail'
  | 'timeout'
  | 'reconcile_complete'
  | 'reconcile_fail'
  | 'reconcile_redispatch';

export interface ReversibleActionMetadata {
  readonly reversible: true;
  readonly undoToken: string;
  readonly undoExpiresAt: string;
  readonly undoHint?: string;
}

export interface ActionRecord {
  readonly actionId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly state: ActionState;
  readonly idempotencyKey: string;
  readonly auditCorrelationId: string;
  readonly payloadHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly auditPendingId?: string;
  readonly externalConfirmationId?: string;
  readonly failureReason?: string;
  readonly reversible?: ReversibleActionMetadata;
}

export interface CreateActionRecordParams {
  readonly actionId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly idempotencyKey: string;
  readonly auditCorrelationId: string;
  readonly payloadHash: string;
  readonly initialState?: 'proposed' | 'approved';
  readonly now?: string;
}

export const REVERSIBLE_ACTION_TYPES = new Set<string>([
  'email.send',
  'email.draft',
  'calendar.create',
  'calendar.update',
  'reminder.create',
  'reminder.update',
]);

export class IllegalActionTransitionError extends Error {
  readonly fromState: ActionState;
  readonly event: ActionEvent;

  constructor(fromState: ActionState, event: ActionEvent) {
    super(`Illegal action transition: ${fromState} + ${event}`);
    this.name = 'IllegalActionTransitionError';
    this.fromState = fromState;
    this.event = event;
  }
}

export class ActionReconcileBlockedError extends Error {
  readonly actionId: string;
  readonly reason: string;

  constructor(actionId: string, reason: string) {
    super(`Action reconcile blocked duplicate dispatch for ${actionId}: ${reason}`);
    this.name = 'ActionReconcileBlockedError';
    this.actionId = actionId;
    this.reason = reason;
  }
}

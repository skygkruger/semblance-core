import {
  ActionEvent,
  ActionRecord,
  ActionState,
  IllegalActionTransitionError,
  REVERSIBLE_ACTION_TYPES,
  type ReversibleActionMetadata,
} from './types.js';

const TRANSITIONS: Readonly<Record<ActionState, Partial<Record<ActionEvent, ActionState>>>> = {
  proposed: {
    approve: 'approved',
    reject: 'rejected',
  },
  approved: {
    dispatch: 'dispatched',
  },
  rejected: {},
  dispatched: {
    complete: 'completed',
    fail: 'failed',
    timeout: 'unknown',
  },
  unknown: {
    reconcile_complete: 'completed',
    reconcile_fail: 'failed',
    reconcile_redispatch: 'dispatched',
  },
  completed: {},
  failed: {},
};

export function isLegalTransition(fromState: ActionState, event: ActionEvent): boolean {
  return TRANSITIONS[fromState]?.[event] !== undefined;
}

export function nextState(fromState: ActionState, event: ActionEvent): ActionState {
  const next = TRANSITIONS[fromState]?.[event];
  if (!next) {
    throw new IllegalActionTransitionError(fromState, event);
  }
  return next;
}

export interface ApplyTransitionOptions {
  readonly now?: string;
  readonly auditPendingId?: string;
  readonly externalConfirmationId?: string;
  readonly failureReason?: string;
  readonly undoToken?: string;
  readonly undoExpiresAt?: string;
  readonly undoHint?: string;
}

export function applyTransition(
  record: ActionRecord,
  event: ActionEvent,
  options: ApplyTransitionOptions = {},
): ActionRecord {
  const state = nextState(record.state, event);
  const now = options.now ?? new Date().toISOString();

  let reversible: ReversibleActionMetadata | undefined = record.reversible;
  if (state === 'completed' && REVERSIBLE_ACTION_TYPES.has(record.actionType)) {
    if (!options.undoToken || !options.undoExpiresAt) {
      throw new Error(
        `Completed reversible action ${record.actionType} requires undoToken and undoExpiresAt`,
      );
    }
    reversible = {
      reversible: true,
      undoToken: options.undoToken,
      undoExpiresAt: options.undoExpiresAt,
      undoHint: options.undoHint,
    };
  }

  return {
    ...record,
    state,
    updatedAt: now,
    auditPendingId: options.auditPendingId ?? record.auditPendingId,
    externalConfirmationId: options.externalConfirmationId ?? record.externalConfirmationId,
    failureReason: options.failureReason ?? record.failureReason,
    reversible,
  };
}

export function listLegalEvents(fromState: ActionState): ActionEvent[] {
  return Object.keys(TRANSITIONS[fromState] ?? {}) as ActionEvent[];
}

export function listAllStates(): ActionState[] {
  return Object.keys(TRANSITIONS) as ActionState[];
}

export function listAllEvents(): ActionEvent[] {
  return [
    'approve',
    'reject',
    'dispatch',
    'complete',
    'fail',
    'timeout',
    'reconcile_complete',
    'reconcile_fail',
    'reconcile_redispatch',
  ];
}

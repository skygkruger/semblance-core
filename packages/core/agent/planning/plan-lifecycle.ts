import { randomUUID } from 'node:crypto';
import type { ActionLifecycleStore, ActionRecord } from '@semblance/kernel';
import type {
  CreatePlanInput,
  DelegatedPlan,
  DelegatedPlanView,
  PlanProgress,
  PlanStatus,
  PlanStep,
  PlanStepFailure,
  PlanStepOutcome,
  PlanStepStatus,
  UpdatePlanInput,
} from './plan-types.js';

type IdFactory = () => string;

const TERMINAL_STEP_STATUSES = new Set<PlanStepStatus>([
  'completed',
  'failed',
  'blocked',
  'cancelled',
]);

function nowIso(): string {
  return new Date().toISOString();
}

export function computePlanProgress(steps: readonly PlanStep[]): PlanProgress {
  const totalSteps = steps.length;
  const completedSteps = steps.filter((step) => step.status === 'completed').length;
  const failedSteps = steps.filter((step) => step.status === 'failed').length;
  const blockedSteps = steps.filter((step) => step.status === 'blocked').length;
  const readySteps = steps.filter((step) => step.status === 'ready').length;
  const inProgressSteps = steps.filter((step) => step.status === 'in_progress').length;
  const percentComplete = totalSteps === 0
    ? 0
    : Math.round((completedSteps / totalSteps) * 100);

  return {
    totalSteps,
    completedSteps,
    failedSteps,
    blockedSteps,
    readySteps,
    inProgressSteps,
    percentComplete,
  };
}

function dependencyFailed(step: PlanStep, stepById: Map<string, PlanStep>): boolean {
  return step.dependsOn.some((depId) => {
    const dep = stepById.get(depId);
    return dep?.status === 'failed';
  });
}

function dependenciesSatisfied(step: PlanStep, stepById: Map<string, PlanStep>): boolean {
  if (step.dependsOn.length === 0) {
    return true;
  }
  return step.dependsOn.every((depId) => stepById.get(depId)?.status === 'completed');
}

export function resolveStepDependencies(steps: readonly PlanStep[]): PlanStep[] {
  const stepById = new Map(steps.map((step) => [step.id, step]));

  return steps.map((step) => {
    if (TERMINAL_STEP_STATUSES.has(step.status)) {
      return step;
    }

    if (dependencyFailed(step, stepById)) {
      return {
        ...step,
        status: 'blocked',
        failure: step.failure ?? {
          code: 'DEPENDENCY_FAILED',
          message: 'A prerequisite step failed',
        },
      };
    }

    if (step.status === 'in_progress') {
      return step;
    }

    if (dependenciesSatisfied(step, stepById)) {
      if (step.status === 'pending' || step.status === 'blocked') {
        return { ...step, status: 'ready', failure: undefined };
      }
      return step;
    }

    if (step.status === 'ready') {
      return { ...step, status: 'pending' };
    }

    return step;
  });
}

export function aggregatePlanStatus(
  steps: readonly PlanStep[],
  currentStatus: PlanStatus,
): PlanStatus {
  if (currentStatus === 'cancelled') {
    return 'cancelled';
  }

  if (steps.length === 0) {
    return currentStatus === 'draft' ? 'draft' : currentStatus;
  }

  const progress = computePlanProgress(steps);

  if (progress.completedSteps === progress.totalSteps) {
    return 'completed';
  }

  if (progress.blockedSteps > 0) {
    return 'blocked';
  }

  if (progress.failedSteps > 0 && progress.inProgressSteps === 0 && progress.readySteps === 0) {
    return 'failed';
  }

  if (currentStatus === 'draft') {
    if (
      progress.inProgressSteps === 0
      && progress.completedSteps === 0
      && progress.failedSteps === 0
      && progress.blockedSteps === 0
    ) {
      return 'draft';
    }
  }

  if (progress.inProgressSteps > 0 || progress.readySteps > 0) {
    return 'active';
  }

  return currentStatus === 'draft' ? 'draft' : 'active';
}

export function createDelegatedPlan(
  input: CreatePlanInput,
  idFactory: IdFactory = randomUUID,
): DelegatedPlan {
  const timestamp = nowIso();
  const steps: PlanStep[] = input.steps.map((stepInput) => ({
    id: idFactory(),
    title: stepInput.title,
    dependsOn: [...(stepInput.dependsOn ?? [])],
    responsibleCapability: stepInput.responsibleCapability,
    status: (stepInput.dependsOn?.length ?? 0) > 0 ? 'pending' : 'ready',
  }));

  const resolvedSteps = resolveStepDependencies(steps);
  const status = input.status ?? 'draft';

  return {
    id: idFactory(),
    title: input.title,
    status: aggregatePlanStatus(resolvedSteps, status),
    steps: resolvedSteps,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateDelegatedPlan(
  plan: DelegatedPlan,
  input: UpdatePlanInput,
): DelegatedPlan {
  const nextSteps = input.steps
    ? resolveStepDependencies([...input.steps])
    : resolveStepDependencies([...plan.steps]);
  const nextStatus = aggregatePlanStatus(
    nextSteps,
    input.status ?? plan.status,
  );

  return {
    ...plan,
    title: input.title ?? plan.title,
    status: nextStatus,
    steps: nextSteps,
    updatedAt: nowIso(),
  };
}

export function toPlanView(plan: DelegatedPlan): DelegatedPlanView {
  const resolvedSteps = resolveStepDependencies([...plan.steps]);
  const status = aggregatePlanStatus(resolvedSteps, plan.status);

  return {
    ...plan,
    status,
    steps: resolvedSteps,
    progress: computePlanProgress(resolvedSteps),
  };
}

export function linkStepActionRequest(
  plan: DelegatedPlan,
  stepId: string,
  actionRequestId: string,
): DelegatedPlan {
  const steps = plan.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }
    return {
      ...step,
      actionRequestId,
      status: step.status === 'ready' || step.status === 'pending'
        ? 'in_progress'
        : step.status,
    };
  });

  return updateDelegatedPlan(plan, { steps });
}

export function markStepComplete(
  plan: DelegatedPlan,
  stepId: string,
  outcome?: PlanStepOutcome,
): DelegatedPlan {
  const steps = plan.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }
    return {
      ...step,
      status: 'completed' as const,
      failure: undefined,
      outcome: outcome ?? step.outcome,
    };
  });

  return updateDelegatedPlan(plan, { steps });
}

export function markStepFailed(
  plan: DelegatedPlan,
  stepId: string,
  failure: PlanStepFailure,
): DelegatedPlan {
  const steps = plan.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }
    return {
      ...step,
      status: 'failed' as const,
      failure,
    };
  });

  return updateDelegatedPlan(plan, { steps });
}

export function attachStepOutcome(
  plan: DelegatedPlan,
  stepId: string,
  outcome: PlanStepOutcome,
): DelegatedPlan {
  const steps = plan.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }
    return {
      ...step,
      outcome,
      status: step.status === 'completed' ? step.status : 'completed',
      failure: undefined,
    };
  });

  return updateDelegatedPlan(plan, { steps });
}

function mapActionStateToStepStatus(state: ActionRecord['state']): PlanStepStatus {
  switch (state) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'rejected':
      return 'failed';
    case 'unknown':
      return 'blocked';
    case 'proposed':
    case 'approved':
    case 'dispatched':
    default:
      return 'in_progress';
  }
}

function buildOutcomeFromAction(record: ActionRecord): PlanStepOutcome {
  return {
    measuredAt: record.updatedAt,
    summary: record.state === 'completed'
      ? `Action ${record.actionType} completed`
      : `Action ${record.actionType} reached ${record.state}`,
    actionState: record.state,
    actionId: record.actionId,
  };
}

function buildFailureFromAction(record: ActionRecord): PlanStepFailure {
  return {
    code: record.state.toUpperCase(),
    message: record.failureReason ?? `Action ${record.actionId} ${record.state}`,
  };
}

export function syncPlanWithActionLifecycle(
  plan: DelegatedPlan,
  actionStore: ActionLifecycleStore | null,
): DelegatedPlan {
  if (!actionStore) {
    return updateDelegatedPlan(plan, { steps: plan.steps });
  }

  const steps = plan.steps.map((step) => {
    if (!step.actionRequestId) {
      return step;
    }

    const record = findActionByRequestId(actionStore, step.actionRequestId);

    if (!record) {
      return step;
    }

    const mappedStatus = mapActionStateToStepStatus(record.state);

    if (mappedStatus === 'completed') {
      const next: PlanStep = {
        ...step,
        status: 'completed',
        failure: undefined,
        outcome: step.outcome ?? buildOutcomeFromAction(record),
      };
      return next;
    }

    if (mappedStatus === 'failed') {
      const next: PlanStep = {
        ...step,
        status: 'failed',
        failure: step.failure ?? buildFailureFromAction(record),
      };
      return next;
    }

    if (mappedStatus === 'blocked') {
      const next: PlanStep = {
        ...step,
        status: 'blocked',
        failure: step.failure ?? buildFailureFromAction(record),
      };
      return next;
    }

    const next: PlanStep = {
      ...step,
      status: 'in_progress',
    };
    return next;
  });

  return updateDelegatedPlan(plan, { steps });
}

function findActionByRequestId(
  store: ActionLifecycleStore,
  requestId: string,
): ActionRecord | null {
  const records = store.listRecords(500, 0);
  return records.find((record: ActionRecord) => record.requestId === requestId) ?? null;
}

export function enrichPlanView(
  plan: DelegatedPlan,
  actionStore: ActionLifecycleStore | null,
): DelegatedPlanView {
  const synced = syncPlanWithActionLifecycle(plan, actionStore);
  return toPlanView(synced);
}

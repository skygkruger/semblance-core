export type PlanStatus =
  | 'draft'
  | 'active'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PlanStepStatus =
  | 'pending'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface PlanStepFailure {
  readonly code?: string;
  readonly message: string;
}

export interface PlanStepOutcome {
  readonly measuredAt: string;
  readonly summary: string;
  readonly timeSavedSeconds?: number;
  readonly actionState?: string;
  readonly actionId?: string;
}

export interface PlanStep {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly responsibleCapability: string;
  readonly status: PlanStepStatus;
  readonly actionRequestId?: string;
  readonly failure?: PlanStepFailure;
  readonly outcome?: PlanStepOutcome;
}

export interface DelegatedPlan {
  readonly id: string;
  readonly title: string;
  readonly status: PlanStatus;
  readonly steps: readonly PlanStep[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlanProgress {
  readonly totalSteps: number;
  readonly completedSteps: number;
  readonly failedSteps: number;
  readonly blockedSteps: number;
  readonly readySteps: number;
  readonly inProgressSteps: number;
  readonly percentComplete: number;
}

export interface DelegatedPlanView extends DelegatedPlan {
  readonly progress: PlanProgress;
}

export interface CreatePlanStepInput {
  readonly title: string;
  readonly dependsOn?: readonly string[];
  readonly responsibleCapability: string;
}

export interface CreatePlanInput {
  readonly title: string;
  readonly steps: readonly CreatePlanStepInput[];
  readonly status?: PlanStatus;
}

export interface UpdatePlanInput {
  readonly title?: string;
  readonly status?: PlanStatus;
  readonly steps?: readonly PlanStep[];
}

export interface ListPlansOptions {
  readonly statuses?: readonly PlanStatus[];
  readonly limit?: number;
  readonly offset?: number;
}

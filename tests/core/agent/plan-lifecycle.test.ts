import { describe, it, expect } from 'vitest';
import { createInMemoryActionLifecycleStore } from '@semblance/kernel';
import {
  aggregatePlanStatus,
  attachStepOutcome,
  computePlanProgress,
  createDelegatedPlan,
  enrichPlanView,
  linkStepActionRequest,
  markStepComplete,
  markStepFailed,
  resolveStepDependencies,
  syncPlanWithActionLifecycle,
} from '../../../packages/core/agent/planning/plan-lifecycle.js';

describe('plan lifecycle — dependencies and progress', () => {
  it('marks dependent steps blocked when a prerequisite fails', () => {
    const ids = ['step-1', 'step-2'];
    const plan = createDelegatedPlan({
      title: 'Follow up',
      status: 'active',
      steps: [
        { title: 'Find thread', responsibleCapability: 'email.search' },
        { title: 'Send reply', responsibleCapability: 'email.send', dependsOn: ['step-1'] },
      ],
    }, () => ids.shift() ?? 'extra');

    const failed = markStepFailed(plan, 'step-1', {
      code: 'NOT_FOUND',
      message: 'No matching email',
    });
    const resolved = resolveStepDependencies(failed.steps);

    expect(resolved[0]?.status).toBe('failed');
    expect(resolved[1]?.status).toBe('blocked');
    expect(aggregatePlanStatus(resolved, failed.status)).toBe('blocked');
  });

  it('computes progress and completes plans when all steps finish', () => {
    const plan = createDelegatedPlan({
      title: 'Two-step plan',
      status: 'active',
      steps: [
        { title: 'A', responsibleCapability: 'calendar.fetch' },
        { title: 'B', responsibleCapability: 'calendar.create', dependsOn: [] },
      ],
    });

    const stepOneId = plan.steps[0]!.id;
    const stepTwoId = plan.steps[1]!.id;

    const afterOne = markStepComplete(plan, stepOneId, {
      measuredAt: '2026-07-19T12:00:00.000Z',
      summary: 'Fetched calendar',
      timeSavedSeconds: 120,
    });
    expect(computePlanProgress(afterOne.steps).percentComplete).toBe(50);

    const completed = markStepComplete(afterOne, stepTwoId, {
      measuredAt: '2026-07-19T12:05:00.000Z',
      summary: 'Created event',
    });

    expect(completed.status).toBe('completed');
    expect(completed.steps.every((step) => step.status === 'completed')).toBe(true);
  });
});

describe('plan lifecycle — action lifecycle linkage', () => {
  it('links actionRequestId and syncs completed outcomes from kernel records', () => {
    const actionStore = createInMemoryActionLifecycleStore();
    const record = actionStore.createAction({
      actionId: 'action-123',
      requestId: 'req-456',
      actionType: 'email.send',
      idempotencyKey: 'idem-789',
      auditCorrelationId: 'audit-001',
      payloadHash: 'hash-001',
      initialState: 'approved',
    });
    actionStore.updateRecord({
      ...record,
      state: 'completed',
      updatedAt: '2026-07-19T13:00:00.000Z',
    });

    let plan = createDelegatedPlan({
      title: 'Send follow-up',
      status: 'active',
      steps: [{ title: 'Send email', responsibleCapability: 'email.send' }],
    });

    plan = linkStepActionRequest(plan, plan.steps[0]!.id, 'req-456');
    expect(plan.steps[0]?.status).toBe('in_progress');
    expect(plan.steps[0]?.actionRequestId).toBe('req-456');

    const synced = syncPlanWithActionLifecycle(plan, actionStore);
    expect(synced.steps[0]?.status).toBe('completed');
    expect(synced.steps[0]?.outcome?.actionId).toBe('action-123');
    expect(synced.steps[0]?.outcome?.actionState).toBe('completed');

    const view = enrichPlanView(plan, actionStore);
    expect(view.progress.completedSteps).toBe(1);
    expect(view.status).toBe('completed');
  });

  it('syncs failed actions into step failure metadata', () => {
    const actionStore = createInMemoryActionLifecycleStore();
    const record = actionStore.createAction({
      actionId: 'action-fail',
      requestId: 'req-fail',
      actionType: 'email.send',
      idempotencyKey: 'idem-fail',
      auditCorrelationId: 'audit-fail',
      payloadHash: 'hash-fail',
      initialState: 'approved',
    });
    actionStore.updateRecord({
      ...record,
      state: 'failed',
      failureReason: 'SMTP rejected',
      updatedAt: '2026-07-19T14:00:00.000Z',
    });

    let plan = createDelegatedPlan({
      title: 'Send email',
      status: 'active',
      steps: [{ title: 'Send', responsibleCapability: 'email.send' }],
    });
    plan = linkStepActionRequest(plan, plan.steps[0]!.id, 'req-fail');

    const synced = syncPlanWithActionLifecycle(plan, actionStore);
    expect(synced.steps[0]?.status).toBe('failed');
    expect(synced.steps[0]?.failure?.message).toContain('SMTP rejected');
    expect(aggregatePlanStatus(synced.steps, synced.status)).toBe('failed');
  });

  it('attaches measured outcomes explicitly', () => {
    const plan = createDelegatedPlan({
      title: 'Measured work',
      status: 'active',
      steps: [{ title: 'Do thing', responsibleCapability: 'forms.submit' }],
    });

    const enriched = attachStepOutcome(plan, plan.steps[0]!.id, {
      measuredAt: '2026-07-19T15:00:00.000Z',
      summary: 'Form submitted with confirmation #123',
      timeSavedSeconds: 900,
    });

    expect(enriched.steps[0]?.outcome?.summary).toContain('confirmation');
    expect(enriched.steps[0]?.status).toBe('completed');
  });
});

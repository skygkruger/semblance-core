import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPlanStore, type PlanStore } from '../../../packages/core/agent/planning/plan-store.js';

describe('PlanStore', () => {
  let tempDir: string;
  let store: PlanStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'plan-store-'));
    store = createPlanStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates and retrieves a plan', () => {
    const plan = store.create({
      title: 'Cancel subscription',
      steps: [
        { title: 'Find renewal email', responsibleCapability: 'email.search' },
        { title: 'Draft cancellation', responsibleCapability: 'email.draft', dependsOn: [] },
      ],
      status: 'active',
    });

    const loaded = store.get(plan.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Cancel subscription');
    expect(loaded?.steps).toHaveLength(2);
    expect(loaded?.status).toBe('active');
  });

  it('lists plans with status filter and persists across reopen', () => {
    const active = store.create({
      title: 'Active plan',
      steps: [{ title: 'Step A', responsibleCapability: 'calendar.fetch' }],
      status: 'active',
    });
    store.create({
      title: 'Draft plan',
      steps: [{ title: 'Step B', responsibleCapability: 'email.fetch' }],
      status: 'draft',
    });

    const activeOnly = store.list({ statuses: ['active'] });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.id).toBe(active.id);

    const reopened = createPlanStore(tempDir);
    expect(reopened.list()).toHaveLength(2);
    expect(reopened.get(active.id)?.title).toBe('Active plan');
  });

  it('updates plan title, status, and steps', () => {
    const plan = store.create({
      title: 'Original',
      steps: [{ title: 'Step 1', responsibleCapability: 'email.send' }],
    });

    const updated = store.update(plan.id, {
      title: 'Updated title',
      status: 'completed',
      steps: plan.steps.map((step) => ({
        ...step,
        status: 'completed',
      })),
    });

    expect(updated.title).toBe('Updated title');
    expect(updated.status).toBe('completed');
    expect(updated.steps[0]?.status).toBe('completed');
    expect(store.get(plan.id)?.updatedAt).toBe(updated.updatedAt);
  });

  it('throws when updating a missing plan', () => {
    expect(() => store.update('missing-plan', { title: 'Nope' })).toThrow(/Plan not found/);
  });
});

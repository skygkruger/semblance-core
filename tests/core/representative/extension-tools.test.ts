/**
 * Step 20 — Extension tools tests.
 * Tests the 4 representative extension tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { createRepresentativeTools } from '@semblance/core/representative/extension-tools';
import type { RepresentativeToolDeps } from '@semblance/core/representative/extension-tools';
import type { CancellableSubscription, RepresentativeDraft, RepresentativeAction } from '@semblance/core/representative/types';
import type { ExtensionTool } from '@semblance/core/extensions/types';

function makeMockDeps(): RepresentativeToolDeps {
  return {
    cancellationEngine: {
      listCancellable: vi.fn(async () => [{
        chargeId: 'ch_1',
        merchantName: 'Netflix',
        amount: -1599,
        frequency: 'monthly',
        estimatedAnnualCost: 19188,
        supportContact: { email: 'support@netflix.com', method: 'email', source: 'known-database' },
        cancellationStatus: 'not-started',
      }] as CancellableSubscription[]),
      initiateCancellation: vi.fn(async () => ({
        to: 'support@netflix.com',
        subject: 'Cancel Subscription — Netflix',
        body: 'Please cancel my subscription.',
        draftType: 'cancellation',
        styleScore: null,
        attempts: 1,
      } as RepresentativeDraft)),
    } as never,
    templateEngine: {
      validateFields: vi.fn(() => ({ valid: true, missing: [] })),
      fillTemplate: vi.fn(async () => ({
        to: 'support@acme.com',
        subject: 'Refund Request — Acme',
        body: 'I would like a refund.',
        draftType: 'refund',
        styleScore: null,
        attempts: 1,
      } as RepresentativeDraft)),
    } as never,
    actionManager: {
      submitAction: vi.fn(async () => ({
        id: 'ra_1',
        status: 'pending',
        classification: 'standard',
      } as unknown as RepresentativeAction)),
      getActionHistory: vi.fn(() => [{
        id: 'ra_1',
        draft: { subject: 'Test Email' },
        status: 'sent',
        classification: 'routine',
        createdAt: '2026-02-20T00:00:00Z',
      }]),
      getPendingActions: vi.fn(() => [{
        id: 'ra_2',
        draft: { to: 'support@co.com', subject: 'Cancellation' },
        classification: 'standard',
        reasoning: 'User requested',
        createdAt: '2026-02-20T00:00:00Z',
      }]),
    } as never,
    followUpTracker: {
      getPendingFollowUps: vi.fn(() => [{
        id: 'fu_1',
        merchantName: 'Netflix',
        stage: 'initial',
        nextFollowUpAt: '2026-02-23T00:00:00Z',
      }]),
      getStats: vi.fn(() => ({ pending: 1, needsAttention: 0, resolved: 2 })),
    } as never,
  };
}

let tools: ExtensionTool[];
let deps: RepresentativeToolDeps;

beforeEach(() => {
  deps = makeMockDeps();
  tools = createRepresentativeTools(deps);
});

describe('createRepresentativeTools (Step 20)', () => {
  it('returns 4 tools, all marked isLocal', () => {
    expect(tools).toHaveLength(4);
    expect(tools.every(t => t.isLocal)).toBe(true);
    const names = tools.map(t => t.definition.name);
    expect(names).toContain('cancel_subscription');
    expect(names).toContain('draft_service_email');
    expect(names).toContain('check_representative_status');
    expect(names).toContain('list_pending_actions');
  });

  it('cancel_subscription lists subscriptions when no chargeId', async () => {
    const tool = tools.find(t => t.definition.name === 'cancel_subscription')!;
    const result = await tool.handler({});
    expect(result.result).toHaveProperty('subscriptions');
    const subs = (result.result as { subscriptions: unknown[] }).subscriptions;
    expect(subs).toHaveLength(1);
  });

  it('cancel_subscription initiates cancellation with chargeId', async () => {
    const tool = tools.find(t => t.definition.name === 'cancel_subscription')!;
    const result = await tool.handler({ chargeId: 'ch_1' });
    expect(result.result).toHaveProperty('status', 'draft-ready');
    expect(deps.cancellationEngine.initiateCancellation).toHaveBeenCalledWith('ch_1');
  });

  it('draft_service_email submits through action manager', async () => {
    const tool = tools.find(t => t.definition.name === 'draft_service_email')!;
    const result = await tool.handler({
      template: 'refund',
      to: 'support@acme.com',
      fields: { companyName: 'Acme', reason: 'Defective', supportEmail: 'support@acme.com' },
    });
    expect(result.result).toHaveProperty('action');
    expect(deps.actionManager.submitAction).toHaveBeenCalledOnce();
  });

  it('check_representative_status returns actions and follow-ups', async () => {
    const tool = tools.find(t => t.definition.name === 'check_representative_status')!;
    const result = await tool.handler({});
    const data = result.result as { recentActions: unknown[]; activeFollowUps: unknown[]; followUpStats: unknown };
    expect(data.recentActions).toHaveLength(1);
    expect(data.activeFollowUps).toHaveLength(1);
    expect(data.followUpStats).toEqual({ pending: 1, needsAttention: 0, resolved: 2 });
  });

  it('list_pending_actions returns pending actions with count', async () => {
    const tool = tools.find(t => t.definition.name === 'list_pending_actions')!;
    const result = await tool.handler({});
    const data = result.result as { pendingActions: unknown[]; count: number };
    expect(data.count).toBe(1);
    expect(data.pendingActions).toHaveLength(1);
  });
});

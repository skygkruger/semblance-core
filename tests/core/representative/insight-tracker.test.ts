/**
 * Step 20 — RepresentativeInsightTracker tests.
 * Tests insight generation for follow-ups, pending approvals, and completed actions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { RepresentativeInsightTracker } from '@semblance/core/representative/insight-tracker';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { FollowUpTracker } from '@semblance/core/representative/follow-up-tracker';
import type { RepresentativeActionManager } from '@semblance/core/representative/action-manager';
import type { RepresentativeAction, FollowUp } from '@semblance/core/representative/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

function makeActionManager(
  pending: Partial<RepresentativeAction>[] = [],
  history: Partial<RepresentativeAction>[] = [],
): RepresentativeActionManager {
  return {
    getPendingActions: () => pending.map(a => ({
      id: a.id ?? 'ra_1',
      draft: a.draft ?? { subject: 'Test', to: 'test@test.com' },
      classification: a.classification ?? 'standard',
      status: 'pending',
      reasoning: '',
      auditRef: null,
      estimatedTimeSavedSeconds: a.estimatedTimeSavedSeconds ?? 300,
      createdAt: a.createdAt ?? new Date().toISOString(),
      resolvedAt: null,
    })),
    getActionHistory: () => history.map(a => ({
      id: a.id ?? 'ra_h1',
      draft: a.draft ?? { subject: 'Completed' },
      classification: a.classification ?? 'routine',
      status: a.status ?? 'sent',
      reasoning: '',
      auditRef: 'audit_1',
      estimatedTimeSavedSeconds: a.estimatedTimeSavedSeconds ?? 180,
      createdAt: a.createdAt ?? new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
    })),
  } as unknown as RepresentativeActionManager;
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('RepresentativeInsightTracker (Step 20)', () => {
  it('returns empty insights when not premium', () => {
    const tracker = new FollowUpTracker(db as unknown as DatabaseHandle);
    const insight = new RepresentativeInsightTracker({
      followUpTracker: tracker,
      actionManager: makeActionManager(),
      premiumGate: gate,
    });

    const insights = insight.generateInsights();
    expect(insights).toHaveLength(0);
  });

  it('generates follow-up-needed insight for due follow-ups', () => {
    activatePremium(gate);
    const tracker = new FollowUpTracker(db as unknown as DatabaseHandle);

    // Create a follow-up with a past nextFollowUpAt
    const fu = tracker.createFollowUp('act_1', 'Netflix', 'Cancel Sub');
    // Manually set nextFollowUpAt to the past
    db.prepare('UPDATE representative_follow_ups SET next_follow_up_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', fu.id);

    const insight = new RepresentativeInsightTracker({
      followUpTracker: tracker,
      actionManager: makeActionManager(),
      premiumGate: gate,
    });

    const insights = insight.generateInsights();
    const fuInsight = insights.find(i => i.type === 'follow-up-needed' && i.title.includes('Netflix'));
    expect(fuInsight).toBeDefined();
    expect(fuInsight!.priority).toBe('high');
  });

  it('generates pending-approval insight when actions are pending', () => {
    activatePremium(gate);
    const tracker = new FollowUpTracker(db as unknown as DatabaseHandle);

    const insight = new RepresentativeInsightTracker({
      followUpTracker: tracker,
      actionManager: makeActionManager([
        { id: 'ra_1', draft: { subject: 'Cancel Netflix' } as never },
        { id: 'ra_2', draft: { subject: 'Billing Inquiry' } as never },
      ]),
      premiumGate: gate,
    });

    const insights = insight.generateInsights();
    const pendingInsight = insights.find(i => i.type === 'pending-approval');
    expect(pendingInsight).toBeDefined();
    expect(pendingInsight!.title).toContain('2 actions');
  });

  it('generates representative-action-complete for recent sent actions', () => {
    activatePremium(gate);
    const tracker = new FollowUpTracker(db as unknown as DatabaseHandle);

    const insight = new RepresentativeInsightTracker({
      followUpTracker: tracker,
      actionManager: makeActionManager([], [
        { id: 'ra_h1', status: 'sent', estimatedTimeSavedSeconds: 600, createdAt: new Date().toISOString() },
      ]),
      premiumGate: gate,
    });

    const insights = insight.generateInsights();
    const completeInsight = insights.find(i => i.type === 'representative-action-complete');
    expect(completeInsight).toBeDefined();
    expect(completeInsight!.summary).toContain('10 minutes');
  });

  it('includes estimatedTimeSavedSeconds on all insights', () => {
    activatePremium(gate);
    const tracker = new FollowUpTracker(db as unknown as DatabaseHandle);

    const fu = tracker.createFollowUp('act_1', 'Spotify', 'Cancel');
    db.prepare('UPDATE representative_follow_ups SET next_follow_up_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', fu.id);

    const insight = new RepresentativeInsightTracker({
      followUpTracker: tracker,
      actionManager: makeActionManager([{ id: 'ra_1', draft: { subject: 'Test' } as never }]),
      premiumGate: gate,
    });

    const insights = insight.generateInsights();
    for (const i of insights) {
      expect(i).toHaveProperty('estimatedTimeSavedSeconds');
      expect(typeof i.estimatedTimeSavedSeconds).toBe('number');
    }
  });
});

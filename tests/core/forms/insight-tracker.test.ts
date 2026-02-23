/**
 * Step 21 — FormInsightTracker tests.
 * Tests insight generation for overdue submissions and premium gating.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { BureaucracyTracker } from '@semblance/core/forms/bureaucracy-tracker';
import { FormInsightTracker } from '@semblance/core/forms/insight-tracker';

let db: InstanceType<typeof Database>;

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('FormInsightTracker (Step 21)', () => {
  it('generates form-reminder-due insight when submission past expected date', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium(gate);

    const tracker = new BureaucracyTracker(db as unknown as DatabaseHandle);
    const sub = tracker.createSubmission({
      formName: 'Expense Report',
      expectedResponseDays: 3,
    });

    // Submit 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    tracker.markSubmitted(sub.id, tenDaysAgo);

    const insightTracker = new FormInsightTracker({ tracker, premiumGate: gate });
    const insights = insightTracker.generateInsights();

    expect(insights.length).toBeGreaterThanOrEqual(1);
    const reminder = insights.find(i => (i as { type: string }).type === 'form-reminder-due');
    expect(reminder).toBeDefined();
    expect(reminder!.title).toContain('Expense Report');
  });

  it('generates form-needs-attention for overdue submissions', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium(gate);

    const tracker = new BureaucracyTracker(db as unknown as DatabaseHandle);
    const sub = tracker.createSubmission({
      formName: 'Insurance Claim',
      expectedResponseDays: 30,
    });

    tracker.markNeedsAttention(sub.id);

    const insightTracker = new FormInsightTracker({ tracker, premiumGate: gate });
    const insights = insightTracker.generateInsights();

    const attention = insights.find(i => (i as { type: string }).type === 'form-needs-attention');
    expect(attention).toBeDefined();
    expect(attention!.title).toContain('Insurance Claim');
  });

  it('returns empty array when not premium', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    // DON'T activate premium

    const tracker = new BureaucracyTracker(db as unknown as DatabaseHandle);
    tracker.createSubmission({ formName: 'Test', expectedResponseDays: 1 });

    const insightTracker = new FormInsightTracker({ tracker, premiumGate: gate });
    const insights = insightTracker.generateInsights();
    expect(insights).toHaveLength(0);
  });

  it('returns empty array when no submissions pending', () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium(gate);

    const tracker = new BureaucracyTracker(db as unknown as DatabaseHandle);
    const insightTracker = new FormInsightTracker({ tracker, premiumGate: gate });
    const insights = insightTracker.generateInsights();
    expect(insights).toHaveLength(0);
  });
});

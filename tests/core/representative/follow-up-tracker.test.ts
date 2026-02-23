/**
 * Step 20 — FollowUpTracker tests.
 * Tests escalation timeline, follow-up recording, and resolution.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { FollowUpTracker } from '@semblance/core/representative/follow-up-tracker';

let db: InstanceType<typeof Database>;
let tracker: FollowUpTracker;

beforeEach(() => {
  db = new Database(':memory:');
  tracker = new FollowUpTracker(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('FollowUpTracker (Step 20)', () => {
  it('createFollowUp creates a follow-up with initial stage', () => {
    const fu = tracker.createFollowUp('act_1', 'Netflix', 'Cancel Subscription');
    expect(fu.actionId).toBe('act_1');
    expect(fu.merchantName).toBe('Netflix');
    expect(fu.stage).toBe('initial');
    expect(fu.followUpCount).toBe(0);
    expect(fu.maxFollowUps).toBe(2);
    expect(fu.nextFollowUpAt).not.toBeNull();
    expect(fu.resolvedAt).toBeNull();
  });

  it('getFollowUp retrieves a created follow-up', () => {
    const created = tracker.createFollowUp('act_2', 'Spotify', 'Billing Question');
    const retrieved = tracker.getFollowUp(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.merchantName).toBe('Spotify');
  });

  it('recordFollowUpSent advances stage and increments count', () => {
    const fu = tracker.createFollowUp('act_3', 'Adobe', 'Cancel Subscription');
    const updated = tracker.recordFollowUpSent(fu.id);
    expect(updated).not.toBeNull();
    expect(updated!.followUpCount).toBe(1);
    expect(updated!.stage).toBe('follow-up-1');
    expect(updated!.nextFollowUpAt).not.toBeNull();
  });

  it('markResolved sets resolved_at and clears next follow-up', () => {
    const fu = tracker.createFollowUp('act_4', 'Dropbox', 'Cancel');
    tracker.markResolved(fu.id);
    const resolved = tracker.getFollowUp(fu.id);
    expect(resolved!.stage).toBe('resolved');
    expect(resolved!.resolvedAt).not.toBeNull();
    expect(resolved!.nextFollowUpAt).toBeNull();
  });

  it('markNeedsAttention transitions stage', () => {
    const fu = tracker.createFollowUp('act_5', 'Zoom', 'Billing Issue');
    tracker.markNeedsAttention(fu.id);
    const updated = tracker.getFollowUp(fu.id);
    expect(updated!.stage).toBe('needs-attention');
    expect(updated!.nextFollowUpAt).toBeNull();
  });

  it('getPendingFollowUps returns unresolved entries', () => {
    tracker.createFollowUp('act_6', 'Netflix', 'Cancel');
    tracker.createFollowUp('act_7', 'Spotify', 'Cancel');
    const fu3 = tracker.createFollowUp('act_8', 'Adobe', 'Cancel');
    tracker.markResolved(fu3.id);

    const pending = tracker.getPendingFollowUps();
    expect(pending).toHaveLength(2);
  });

  it('getStats returns correct counts', () => {
    const fu1 = tracker.createFollowUp('act_9', 'Netflix', 'Cancel');
    tracker.createFollowUp('act_10', 'Spotify', 'Cancel');
    const fu3 = tracker.createFollowUp('act_11', 'Adobe', 'Cancel');
    tracker.markResolved(fu1.id);
    tracker.markNeedsAttention(fu3.id);

    const stats = tracker.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.needsAttention).toBe(1);
    expect(stats.resolved).toBe(1);
  });
});

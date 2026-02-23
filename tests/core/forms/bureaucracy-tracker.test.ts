/**
 * Step 21 — BureaucracyTracker tests.
 * Tests submission CRUD, due reminders, and status management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { BureaucracyTracker } from '@semblance/core/forms/bureaucracy-tracker';

let db: InstanceType<typeof Database>;
let tracker: BureaucracyTracker;

beforeEach(() => {
  db = new Database(':memory:');
  tracker = new BureaucracyTracker(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('BureaucracyTracker (Step 21)', () => {
  it('creates submission with all fields', () => {
    const sub = tracker.createSubmission({
      formName: 'Expense Report',
      templateId: 'expense-report',
      expectedResponseDays: 14,
      notes: 'Q4 expenses',
    });

    expect(sub.id).toMatch(/^fs_/);
    expect(sub.formName).toBe('Expense Report');
    expect(sub.templateId).toBe('expense-report');
    expect(sub.expectedResponseDays).toBe(14);
    expect(sub.status).toBe('filled');
    expect(sub.notes).toBe('Q4 expenses');
  });

  it('getDueReminders returns submissions past expected date', () => {
    const sub = tracker.createSubmission({
      formName: 'PTO Request',
      expectedResponseDays: 3,
    });

    // Mark as submitted 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    tracker.markSubmitted(sub.id, tenDaysAgo);

    const due = tracker.getDueReminders();
    expect(due.length).toBeGreaterThanOrEqual(1);
    expect(due.some(d => d.id === sub.id)).toBe(true);
  });

  it('getDueReminders excludes resolved submissions', () => {
    const sub = tracker.createSubmission({
      formName: 'Test Form',
      expectedResponseDays: 1,
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    tracker.markSubmitted(sub.id, twoDaysAgo);
    tracker.markResolved(sub.id);

    const due = tracker.getDueReminders();
    expect(due.some(d => d.id === sub.id)).toBe(false);
  });

  it('markSubmitted updates timestamp', () => {
    const sub = tracker.createSubmission({
      formName: 'W-4',
      expectedResponseDays: 1,
    });

    const date = '2026-01-15T12:00:00.000Z';
    tracker.markSubmitted(sub.id, date);

    const fetched = tracker.getSubmission(sub.id);
    expect(fetched!.status).toBe('submitted');
    expect(fetched!.submittedAt).toBe(date);
  });

  it('markResolved changes status', () => {
    const sub = tracker.createSubmission({
      formName: 'Insurance',
      expectedResponseDays: 30,
    });

    tracker.markResolved(sub.id);
    const fetched = tracker.getSubmission(sub.id);
    expect(fetched!.status).toBe('resolved');
  });

  it('markNeedsAttention changes status', () => {
    const sub = tracker.createSubmission({
      formName: 'Claim',
      expectedResponseDays: 30,
    });

    tracker.markNeedsAttention(sub.id);
    const fetched = tracker.getSubmission(sub.id);
    expect(fetched!.status).toBe('needs-attention');
  });

  it('getStats returns correct counts', () => {
    tracker.createSubmission({ formName: 'A', expectedResponseDays: 14 });
    const sub2 = tracker.createSubmission({ formName: 'B', expectedResponseDays: 14 });
    tracker.markSubmitted(sub2.id);
    const sub3 = tracker.createSubmission({ formName: 'C', expectedResponseDays: 14 });
    tracker.markResolved(sub3.id);

    const stats = tracker.getStats();
    expect(stats.filled).toBe(1);
    expect(stats.submitted).toBe(1);
    expect(stats.resolved).toBe(1);
  });
});

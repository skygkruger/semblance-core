// Tests for Commit 8: Mobile Feature Wiring — Sprint 2 features.
// Email inbox rendering, swipe action triggers, calendar, subscriptions,
// Network Monitor display, and action log.

import { describe, it, expect } from 'vitest';
import {
  emailsToInboxItems,
  remindersToInboxItems,
  actionsToInboxItems,
  digestToInboxItem,
  mergeInboxItems,
} from '../../packages/mobile/src/data/inbox-adapter.js';
import {
  auditEntriesToMonitorEntries,
  computeMonitorStats,
} from '../../packages/mobile/src/data/network-monitor-adapter.js';
import {
  chargesToSubscriptionItems,
  buildSubscriptionSummary,
} from '../../packages/mobile/src/data/subscription-adapter.js';
import type { IndexedEmail, Reminder, AutonomousAction, WeeklyDigest } from '../../packages/mobile/src/data/inbox-adapter.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

// ─── Inbox Adapter — Email ──────────────────────────────────────────────────

describe('Mobile Feature Wiring — Email Inbox', () => {
  const mockEmails: IndexedEmail[] = [
    {
      id: '1',
      messageId: 'msg-1',
      from: 'alice@example.com',
      subject: 'Q1 Report Review',
      snippet: 'Please review the attached quarterly report...',
      receivedAt: new Date(Date.now() - 30 * 60_000).toISOString(), // 30 min ago
      category: 'actionable',
      priority: 'high',
      isRead: false,
    },
    {
      id: '2',
      messageId: 'msg-2',
      from: 'newsletter@example.com',
      subject: 'Weekly Tech Digest',
      snippet: 'Top stories this week in AI and machine learning...',
      receivedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), // 2 hours ago
      category: 'newsletter',
      priority: 'low',
      isRead: true,
    },
  ];

  it('converts emails to inbox items', () => {
    const items = emailsToInboxItems(mockEmails);

    expect(items).toHaveLength(2);
    expect(items[0]!.type).toBe('email');
    expect(items[0]!.title).toBe('Q1 Report Review');
    expect(items[0]!.read).toBe(false);
    expect(items[0]!.priority).toBe('high');
    expect(items[0]!.category).toBe('actionable');
  });

  it('handles empty subject', () => {
    const items = emailsToInboxItems([
      { ...mockEmails[0]!, subject: '' },
    ]);
    expect(items[0]!.title).toBe('(no subject)');
  });

  it('prefixes email IDs', () => {
    const items = emailsToInboxItems(mockEmails);
    expect(items[0]!.id).toBe('email-1');
  });
});

// ─── Inbox Adapter — Reminders ──────────────────────────────────────────────

describe('Mobile Feature Wiring — Reminders Inbox', () => {
  it('converts pending reminders to inbox items', () => {
    const reminders: Reminder[] = [
      {
        id: 'r1',
        text: 'Call dentist for appointment',
        dueAt: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min from now
        status: 'pending',
      },
      {
        id: 'r2',
        text: 'Submit expense report',
        dueAt: new Date(Date.now() + 48 * 3_600_000).toISOString(), // 2 days from now
        status: 'pending',
      },
      {
        id: 'r3',
        text: 'Old completed reminder',
        dueAt: new Date(Date.now() - 3_600_000).toISOString(),
        status: 'completed', // Should be filtered out
      },
    ];

    const items = remindersToInboxItems(reminders);
    expect(items).toHaveLength(2); // Excludes completed
    expect(items[0]!.type).toBe('reminder');
    expect(items[0]!.id).toBe('reminder-r1');
    expect(items[0]!.priority).toBe('high'); // Due within 1 hour
    expect(items[1]!.priority).toBe('normal'); // Due in 2 days
  });
});

// ─── Inbox Adapter — Autonomous Actions ─────────────────────────────────────

describe('Mobile Feature Wiring — Autonomous Actions', () => {
  it('converts actions to inbox items', () => {
    const actions: AutonomousAction[] = [
      {
        id: 'a1',
        action: 'email.archive',
        description: 'Archived 3 newsletter emails',
        timestamp: new Date().toISOString(),
        status: 'success',
        autonomyTier: 'partner',
      },
    ];

    const items = actionsToInboxItems(actions);
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe('action');
    expect(items[0]!.preview).toContain('partner');
  });
});

// ─── Inbox Adapter — Weekly Digest ──────────────────────────────────────────

describe('Mobile Feature Wiring — Weekly Digest', () => {
  it('converts digest to inbox item', () => {
    const digest: WeeklyDigest = {
      id: 'd1',
      weekStart: '2026-02-10',
      weekEnd: '2026-02-16',
      totalActions: 42,
      estimatedTimeSavedMinutes: 87,
      narrative: 'This week Semblance handled 42 actions, saving you approximately 87 minutes.',
    };

    const item = digestToInboxItem(digest);
    expect(item.type).toBe('digest');
    expect(item.title).toContain('87 min saved');
    expect(item.preview).toContain('42 actions');
  });
});

// ─── Inbox Adapter — Merge ──────────────────────────────────────────────────

describe('Mobile Feature Wiring — Inbox Merge', () => {
  it('merges and sorts multiple inbox item groups', () => {
    const emails = emailsToInboxItems([{
      id: '1', messageId: 'm1', from: 'a@b.com', subject: 'Test',
      snippet: '...', receivedAt: new Date().toISOString(),
      category: 'actionable', priority: 'normal', isRead: false,
    }]);

    const reminders = remindersToInboxItems([{
      id: 'r1', text: 'Call', dueAt: new Date(Date.now() + 3_600_000).toISOString(),
      status: 'pending',
    }]);

    const merged = mergeInboxItems(emails, reminders);
    expect(merged.length).toBe(2);
    // Both types present
    const types = merged.map(i => i.type);
    expect(types).toContain('email');
    expect(types).toContain('reminder');
  });
});

// ─── Network Monitor Adapter ────────────────────────────────────────────────

describe('Mobile Feature Wiring — Network Monitor', () => {
  const mockEntries = [
    { id: '1', action: 'email.fetch', timestamp: '2026-02-20T10:00:00Z', status: 'success', direction: 'request', estimated_time_saved_seconds: 5 },
    { id: '2', action: 'email.fetch', timestamp: '2026-02-20T10:00:01Z', status: 'success', direction: 'response', estimated_time_saved_seconds: 0 },
    { id: '3', action: 'calendar.fetch', timestamp: '2026-02-20T10:01:00Z', status: 'success', direction: 'request', estimated_time_saved_seconds: 3 },
    { id: '4', action: 'email.send', timestamp: '2026-02-20T10:02:00Z', status: 'error', direction: 'request', estimated_time_saved_seconds: 0 },
  ];

  it('converts audit entries to monitor entries', () => {
    const entries = auditEntriesToMonitorEntries(mockEntries);
    expect(entries).toHaveLength(4);
    expect(entries[0]!.service).toBe('email');
    expect(entries[2]!.service).toBe('calendar');
  });

  it('computes monitor stats correctly', () => {
    const entries = auditEntriesToMonitorEntries(mockEntries);
    const stats = computeMonitorStats(entries);

    expect(stats.totalActions).toBe(3); // Only requests
    expect(stats.successCount).toBe(2);
    expect(stats.errorCount).toBe(1);
    expect(stats.totalTimeSavedSeconds).toBe(8);
    expect(stats.actionsByService['email']).toBe(2);
    expect(stats.actionsByService['calendar']).toBe(1);
  });
});

// ─── Subscription Adapter ───────────────────────────────────────────────────

describe('Mobile Feature Wiring — Subscriptions', () => {
  const mockCharges = [
    { id: 's1', merchant: 'Netflix', amount: 15.99, frequency: 'monthly', confidence: 0.95, isForgotten: false },
    { id: 's2', merchant: 'Old Gym', amount: 29.99, frequency: 'monthly', confidence: 0.88, isForgotten: true, lastDate: '2025-12-01' },
    { id: 's3', merchant: 'Annual Insurance', amount: 1200, frequency: 'annual', confidence: 0.92, isForgotten: false },
  ];

  it('converts charges to subscription items with annual cost', () => {
    const items = chargesToSubscriptionItems(mockCharges);

    expect(items).toHaveLength(3);
    expect(items[0]!.annualCost).toBeCloseTo(15.99 * 12);
    expect(items[1]!.isForgotten).toBe(true);
    expect(items[2]!.annualCost).toBe(1200);
  });

  it('builds subscription summary', () => {
    const items = chargesToSubscriptionItems(mockCharges);
    const summary = buildSubscriptionSummary(items);

    expect(summary.totalSubscriptions).toBe(3);
    expect(summary.forgottenCount).toBe(1);
    expect(summary.forgottenAnnualCost).toBeCloseTo(29.99 * 12);
    expect(summary.totalAnnualCost).toBeGreaterThan(0);
  });
});

// ─── Data Adapter Files Exist ───────────────────────────────────────────────

describe('Mobile Feature Wiring — Data Adapters Exist', () => {
  const adapters = [
    'data/inbox-adapter.ts',
    'data/network-monitor-adapter.ts',
    'data/subscription-adapter.ts',
  ];

  for (const adapter of adapters) {
    it(`${adapter} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, 'packages/mobile/src', adapter))).toBe(true);
    });
  }
});

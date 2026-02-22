// Tests for Step 10 Commit 11 — Reminder Scheduler
// Background polling, due reminder detection, snooze reactivation,
// recurring generation, notification firing, inbox surfacing.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReminderScheduler } from '@semblance/core/agent/reminder-scheduler.js';
import { ReminderStore } from '@semblance/core/knowledge/reminder-store.js';
import type { Reminder } from '@semblance/core/knowledge/reminder-store.js';
import DatabaseConstructor from 'better-sqlite3';

function createStoreAndScheduler(pollIntervalMs = 30_000) {
  const db = new DatabaseConstructor(':memory:');
  const store = new ReminderStore(db);
  const scheduler = new ReminderScheduler({ store, pollIntervalMs });
  return { db, store, scheduler };
}

describe('ReminderScheduler: tick()', () => {
  it('fires due reminders and updates status', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T14:00:00.000Z');

    // Create a reminder due in the past
    store.create({
      text: 'call dentist',
      dueAt: '2026-02-22T13:00:00.000Z',
      recurrence: 'none',
      source: 'chat',
    });

    const fired = scheduler.tick(now);
    expect(fired).toHaveLength(1);
    expect(fired[0].text).toBe('call dentist');

    // Verify status is now 'fired'
    const all = store.findAll();
    expect(all[0].status).toBe('fired');
  });

  it('does not fire reminders that are not yet due', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T12:00:00.000Z');

    store.create({
      text: 'future reminder',
      dueAt: '2026-02-22T15:00:00.000Z',
      recurrence: 'none',
      source: 'chat',
    });

    const fired = scheduler.tick(now);
    expect(fired).toHaveLength(0);
  });

  it('reactivates snoozed reminders whose snooze has expired', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T14:00:00.000Z');

    // Create and snooze a reminder
    const reminder = store.create({
      text: 'snoozed item',
      dueAt: '2026-02-22T12:00:00.000Z',
      recurrence: 'none',
      source: 'chat',
    });
    store.snooze(reminder.id, '2026-02-22T13:30:00.000Z');

    // Verify it's snoozed
    const snoozed = store.findById(reminder.id);
    expect(snoozed!.status).toBe('snoozed');

    // Tick — snooze expired, should reactivate and then fire
    const fired = scheduler.tick(now);
    // After reactivation, the reminder becomes pending with its original due_at,
    // which is in the past, so it should fire immediately
    expect(fired).toHaveLength(1);
    expect(fired[0].text).toBe('snoozed item');
  });

  it('does not reactivate snoozed reminders still in snooze period', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T13:00:00.000Z');

    const reminder = store.create({
      text: 'still snoozed',
      dueAt: '2026-02-22T12:00:00.000Z',
      recurrence: 'none',
      source: 'chat',
    });
    store.snooze(reminder.id, '2026-02-22T15:00:00.000Z'); // snoozed until 3pm

    const fired = scheduler.tick(now);
    expect(fired).toHaveLength(0);

    // Still snoozed
    const found = store.findById(reminder.id);
    expect(found!.status).toBe('snoozed');
  });

  it('handles recurring reminders — creates next occurrence', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T10:00:00.000Z');

    store.create({
      text: 'daily standup',
      dueAt: '2026-02-22T09:00:00.000Z',
      recurrence: 'daily',
      source: 'chat',
    });

    const countBefore = store.count();
    const fired = scheduler.tick(now);
    expect(fired).toHaveLength(1);

    // Should have created the next occurrence
    const countAfter = store.count();
    expect(countAfter).toBe(countBefore + 1);

    // Next occurrence should be pending for tomorrow
    const pending = store.findByStatus('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].text).toBe('daily standup');
    expect(pending[0].dueAt).toContain('2026-02-23');
  });

  it('calls notification handler when reminder fires', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T14:00:00.000Z');
    const handler = vi.fn();
    scheduler.onNotification(handler);

    store.create({
      text: 'take medicine',
      dueAt: '2026-02-22T13:00:00.000Z',
      recurrence: 'none',
      source: 'chat',
    });

    scheduler.tick(now);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      text: 'take medicine',
      recurrence: 'none',
    }));
  });

  it('calls inbox surface handler when reminder fires', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T14:00:00.000Z');
    const handler = vi.fn();
    scheduler.onInboxSurface(handler);

    store.create({
      text: 'buy groceries',
      dueAt: '2026-02-22T13:00:00.000Z',
      recurrence: 'none',
      source: 'quick-capture',
    });

    scheduler.tick(now);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      text: 'buy groceries',
      source: 'quick-capture',
    }));
  });

  it('fires multiple due reminders in a single tick', () => {
    const { store, scheduler } = createStoreAndScheduler();
    const now = new Date('2026-02-22T14:00:00.000Z');

    store.create({ text: 'first', dueAt: '2026-02-22T12:00:00.000Z', recurrence: 'none', source: 'chat' });
    store.create({ text: 'second', dueAt: '2026-02-22T13:00:00.000Z', recurrence: 'none', source: 'chat' });
    store.create({ text: 'future', dueAt: '2026-02-22T16:00:00.000Z', recurrence: 'none', source: 'chat' });

    const fired = scheduler.tick(now);
    expect(fired).toHaveLength(2);
    expect(fired.map(r => r.text).sort()).toEqual(['first', 'second']);
  });
});

describe('ReminderScheduler: start/stop', () => {
  it('starts and stops periodic polling', () => {
    const { scheduler } = createStoreAndScheduler(1000);

    expect(scheduler.isRunning()).toBe(false);
    const stop = scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('stop is idempotent', () => {
    const { scheduler } = createStoreAndScheduler(1000);

    scheduler.start();
    scheduler.stop();
    scheduler.stop(); // Should not throw
    expect(scheduler.isRunning()).toBe(false);
  });
});

describe('ReminderCard component', () => {
  it('component file exists with correct structure', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const componentPath = path.resolve(
      __dirname,
      '../../packages/desktop/src/components/ReminderCard.tsx',
    );
    expect(fs.existsSync(componentPath)).toBe(true);
    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('export function ReminderCard');
    expect(content).toContain('onSnooze');
    expect(content).toContain('onDismiss');
    expect(content).toContain('data-testid="reminder-card"');
    expect(content).toContain('data-testid="snooze-15min"');
    expect(content).toContain('data-testid="dismiss-reminder"');
  });
});

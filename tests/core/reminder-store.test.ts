// Tests for Step 10 Commit 2 — Reminder SQLite Store
// Full CRUD, snooze, recurring, findDue, time boundary correctness.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  ReminderStore,
  computeNextOccurrence,
} from '@semblance/core/knowledge/reminder-store.js';
import type { Reminder, CreateReminderInput } from '@semblance/core/knowledge/reminder-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

function createInMemoryStore(): ReminderStore {
  const db = new Database(':memory:');
  return new ReminderStore(db as unknown as DatabaseHandle);
}

describe('ReminderStore: CRUD operations', () => {
  let store: ReminderStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('creates a reminder with required fields', () => {
    const reminder = store.create({
      text: 'Call the dentist',
      dueAt: '2026-02-22T15:00:00.000Z',
    });
    expect(reminder.id).toMatch(/^rem_/);
    expect(reminder.text).toBe('Call the dentist');
    expect(reminder.dueAt).toBe('2026-02-22T15:00:00.000Z');
    expect(reminder.recurrence).toBe('none');
    expect(reminder.status).toBe('pending');
    expect(reminder.source).toBe('chat');
    expect(reminder.snoozedUntil).toBeNull();
    expect(reminder.createdAt).toBeTruthy();
    expect(reminder.updatedAt).toBeTruthy();
  });

  it('creates a reminder with all optional fields', () => {
    const reminder = store.create({
      text: 'Team standup',
      dueAt: '2026-02-23T09:00:00.000Z',
      recurrence: 'daily',
      source: 'quick-capture',
    });
    expect(reminder.recurrence).toBe('daily');
    expect(reminder.source).toBe('quick-capture');
  });

  it('findById returns the correct reminder', () => {
    const created = store.create({ text: 'Test', dueAt: '2026-02-22T10:00:00.000Z' });
    const found = store.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.text).toBe('Test');
  });

  it('findById returns null for non-existent id', () => {
    const found = store.findById('rem_nonexistent');
    expect(found).toBeNull();
  });

  it('updates reminder text and dueAt', () => {
    const created = store.create({ text: 'Original', dueAt: '2026-02-22T10:00:00.000Z' });
    const updated = store.update(created.id, {
      text: 'Updated',
      dueAt: '2026-02-23T10:00:00.000Z',
    });
    expect(updated).not.toBeNull();
    expect(updated!.text).toBe('Updated');
    expect(updated!.dueAt).toBe('2026-02-23T10:00:00.000Z');
  });

  it('update returns null for non-existent id', () => {
    const result = store.update('rem_nonexistent', { text: 'nope' });
    expect(result).toBeNull();
  });

  it('deletes a reminder', () => {
    const created = store.create({ text: 'Delete me', dueAt: '2026-02-22T10:00:00.000Z' });
    const deleted = store.delete(created.id);
    expect(deleted).toBe(true);
    expect(store.findById(created.id)).toBeNull();
  });

  it('delete returns false for non-existent id', () => {
    const result = store.delete('rem_nonexistent');
    expect(result).toBe(false);
  });

  it('findAll returns all reminders ordered by due_at', () => {
    store.create({ text: 'Later', dueAt: '2026-02-23T10:00:00.000Z' });
    store.create({ text: 'Earlier', dueAt: '2026-02-22T10:00:00.000Z' });
    const all = store.findAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.text).toBe('Earlier');
    expect(all[1]!.text).toBe('Later');
  });

  it('findAll respects limit', () => {
    for (let i = 0; i < 5; i++) {
      store.create({ text: `Reminder ${i}`, dueAt: `2026-02-2${i + 1}T10:00:00.000Z` });
    }
    const limited = store.findAll(3);
    expect(limited).toHaveLength(3);
  });

  it('count returns total count', () => {
    expect(store.count()).toBe(0);
    store.create({ text: 'One', dueAt: '2026-02-22T10:00:00.000Z' });
    store.create({ text: 'Two', dueAt: '2026-02-22T11:00:00.000Z' });
    expect(store.count()).toBe(2);
  });

  it('count with status filter', () => {
    store.create({ text: 'Pending', dueAt: '2026-02-22T10:00:00.000Z' });
    const r2 = store.create({ text: 'To dismiss', dueAt: '2026-02-22T11:00:00.000Z' });
    store.update(r2.id, { status: 'dismissed' });
    expect(store.count('pending')).toBe(1);
    expect(store.count('dismissed')).toBe(1);
  });
});

describe('ReminderStore: findByStatus', () => {
  let store: ReminderStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('returns only reminders with matching status', () => {
    store.create({ text: 'Pending 1', dueAt: '2026-02-22T10:00:00.000Z' });
    const r2 = store.create({ text: 'Dismissed', dueAt: '2026-02-22T11:00:00.000Z' });
    store.update(r2.id, { status: 'dismissed' });
    store.create({ text: 'Pending 2', dueAt: '2026-02-22T12:00:00.000Z' });

    const pending = store.findByStatus('pending');
    expect(pending).toHaveLength(2);
    expect(pending.every(r => r.status === 'pending')).toBe(true);

    const dismissed = store.findByStatus('dismissed');
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0]!.text).toBe('Dismissed');
  });
});

describe('ReminderStore: findDue', () => {
  let store: ReminderStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('finds reminders due before the given time', () => {
    store.create({ text: 'Past due', dueAt: '2026-02-21T10:00:00.000Z' });
    store.create({ text: 'Due now', dueAt: '2026-02-22T12:00:00.000Z' });
    store.create({ text: 'Future', dueAt: '2026-02-23T10:00:00.000Z' });

    const due = store.findDue('2026-02-22T12:00:00.000Z');
    expect(due).toHaveLength(2);
    expect(due[0]!.text).toBe('Past due');
    expect(due[1]!.text).toBe('Due now');
  });

  it('does not find dismissed or fired reminders', () => {
    const r1 = store.create({ text: 'Fired', dueAt: '2026-02-21T10:00:00.000Z' });
    store.update(r1.id, { status: 'fired' });
    const r2 = store.create({ text: 'Dismissed', dueAt: '2026-02-21T11:00:00.000Z' });
    store.update(r2.id, { status: 'dismissed' });
    store.create({ text: 'Still pending', dueAt: '2026-02-21T12:00:00.000Z' });

    const due = store.findDue('2026-02-22T00:00:00.000Z');
    expect(due).toHaveLength(1);
    expect(due[0]!.text).toBe('Still pending');
  });

  it('returns empty array when no reminders are due', () => {
    store.create({ text: 'Future', dueAt: '2026-12-31T23:59:59.000Z' });
    const due = store.findDue('2026-02-22T00:00:00.000Z');
    expect(due).toHaveLength(0);
  });
});

describe('ReminderStore: snooze', () => {
  let store: ReminderStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('snoozes a reminder with snoozedUntil', () => {
    const created = store.create({ text: 'Snooze me', dueAt: '2026-02-22T10:00:00.000Z' });
    const snoozed = store.snooze(created.id, '2026-02-22T10:15:00.000Z');
    expect(snoozed).not.toBeNull();
    expect(snoozed!.status).toBe('snoozed');
    expect(snoozed!.snoozedUntil).toBe('2026-02-22T10:15:00.000Z');
  });

  it('findSnoozedReady returns reminders ready to reactivate', () => {
    const r1 = store.create({ text: 'Snooze 1', dueAt: '2026-02-22T09:00:00.000Z' });
    store.snooze(r1.id, '2026-02-22T09:15:00.000Z');
    const r2 = store.create({ text: 'Snooze 2', dueAt: '2026-02-22T09:30:00.000Z' });
    store.snooze(r2.id, '2026-02-22T11:00:00.000Z');

    const ready = store.findSnoozedReady('2026-02-22T10:00:00.000Z');
    expect(ready).toHaveLength(1);
    expect(ready[0]!.text).toBe('Snooze 1');
  });

  it('reactivate sets status back to pending and clears snoozedUntil', () => {
    const created = store.create({ text: 'Reactivate me', dueAt: '2026-02-22T10:00:00.000Z' });
    store.snooze(created.id, '2026-02-22T10:15:00.000Z');
    const reactivated = store.reactivate(created.id);
    expect(reactivated).not.toBeNull();
    expect(reactivated!.status).toBe('pending');
    expect(reactivated!.snoozedUntil).toBeNull();
  });

  it('snooze round-trip: snooze → findSnoozedReady → reactivate → findDue', () => {
    const created = store.create({ text: 'Round trip', dueAt: '2026-02-22T10:00:00.000Z' });

    // Snooze for 15 minutes
    store.snooze(created.id, '2026-02-22T10:15:00.000Z');

    // Not yet ready at 10:10
    expect(store.findSnoozedReady('2026-02-22T10:10:00.000Z')).toHaveLength(0);

    // Ready at 10:15
    const ready = store.findSnoozedReady('2026-02-22T10:15:00.000Z');
    expect(ready).toHaveLength(1);

    // Reactivate
    store.reactivate(created.id);

    // Now shows up as due
    const due = store.findDue('2026-02-22T10:15:00.000Z');
    expect(due).toHaveLength(1);
    expect(due[0]!.text).toBe('Round trip');
    expect(due[0]!.status).toBe('pending');
  });
});

describe('ReminderStore: recurring reminders', () => {
  let store: ReminderStore;

  beforeEach(() => {
    store = createInMemoryStore();
  });

  it('fire creates next daily occurrence', () => {
    const created = store.create({
      text: 'Daily standup',
      dueAt: '2026-02-22T09:00:00.000Z',
      recurrence: 'daily',
    });
    const result = store.fire(created.id);
    expect(result).not.toBeNull();
    expect(result!.fired.status).toBe('fired');
    expect(result!.next).not.toBeNull();
    expect(result!.next!.text).toBe('Daily standup');
    expect(result!.next!.dueAt).toBe('2026-02-23T09:00:00.000Z');
    expect(result!.next!.recurrence).toBe('daily');
    expect(result!.next!.status).toBe('pending');
  });

  it('fire creates next weekly occurrence', () => {
    const created = store.create({
      text: 'Weekly review',
      dueAt: '2026-02-22T14:00:00.000Z',
      recurrence: 'weekly',
    });
    const result = store.fire(created.id);
    expect(result!.next).not.toBeNull();
    expect(result!.next!.dueAt).toBe('2026-03-01T14:00:00.000Z');
  });

  it('fire creates next monthly occurrence', () => {
    const created = store.create({
      text: 'Monthly report',
      dueAt: '2026-01-15T10:00:00.000Z',
      recurrence: 'monthly',
    });
    const result = store.fire(created.id);
    expect(result!.next).not.toBeNull();
    expect(result!.next!.dueAt).toBe('2026-02-15T10:00:00.000Z');
  });

  it('fire does not create next occurrence for non-recurring', () => {
    const created = store.create({
      text: 'One-time reminder',
      dueAt: '2026-02-22T10:00:00.000Z',
    });
    const result = store.fire(created.id);
    expect(result!.fired.status).toBe('fired');
    expect(result!.next).toBeNull();
  });

  it('fire returns null for non-existent id', () => {
    const result = store.fire('rem_nonexistent');
    expect(result).toBeNull();
  });
});

describe('computeNextOccurrence', () => {
  it('returns null for non-recurring', () => {
    expect(computeNextOccurrence('2026-02-22T10:00:00.000Z', 'none')).toBeNull();
  });

  it('adds 1 day for daily', () => {
    expect(computeNextOccurrence('2026-02-22T10:00:00.000Z', 'daily')).toBe('2026-02-23T10:00:00.000Z');
  });

  it('adds 7 days for weekly', () => {
    expect(computeNextOccurrence('2026-02-22T10:00:00.000Z', 'weekly')).toBe('2026-03-01T10:00:00.000Z');
  });

  it('adds 1 month for monthly', () => {
    expect(computeNextOccurrence('2026-01-31T10:00:00.000Z', 'monthly')).toBe('2026-03-03T10:00:00.000Z');
  });

  it('handles year boundary for daily', () => {
    expect(computeNextOccurrence('2026-12-31T23:00:00.000Z', 'daily')).toBe('2027-01-01T23:00:00.000Z');
  });
});

describe('ReminderStore: unique IDs', () => {
  it('generates unique IDs for each reminder', () => {
    const store = createInMemoryStore();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const r = store.create({ text: `Reminder ${i}`, dueAt: '2026-02-22T10:00:00.000Z' });
      ids.add(r.id);
    }
    expect(ids.size).toBe(20);
  });
});

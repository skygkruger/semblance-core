// Tests for Step 10 Commit 3 — Reminder Gateway Adapter
// Adapter routes to store, handles CRUD, returns correct response shapes.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ReminderStore } from '@semblance/core/knowledge/reminder-store.js';
import { ReminderAdapter } from '@semblance/gateway/services/reminder-adapter.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

function createAdapter(): { adapter: ReminderAdapter; store: ReminderStore } {
  const db = new Database(':memory:');
  const store = new ReminderStore(db as unknown as DatabaseHandle);
  const adapter = new ReminderAdapter(store);
  return { adapter, store };
}

describe('ReminderAdapter: reminder.create', () => {
  it('creates a reminder and returns it', async () => {
    const { adapter } = createAdapter();
    const result = await adapter.execute('reminder.create', {
      text: 'Call the dentist',
      dueAt: '2026-02-22T15:00:00.000Z',
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as { reminder: { id: string; text: string; status: string } };
    expect(data.reminder.text).toBe('Call the dentist');
    expect(data.reminder.status).toBe('pending');
    expect(data.reminder.id).toMatch(/^rem_/);
  });

  it('creates a reminder with recurrence and source', async () => {
    const { adapter } = createAdapter();
    const result = await adapter.execute('reminder.create', {
      text: 'Team standup',
      dueAt: '2026-02-23T09:00:00.000Z',
      recurrence: 'daily',
      source: 'quick-capture',
    });
    expect(result.success).toBe(true);
    const data = result.data as { reminder: { recurrence: string; source: string } };
    expect(data.reminder.recurrence).toBe('daily');
    expect(data.reminder.source).toBe('quick-capture');
  });
});

describe('ReminderAdapter: reminder.update', () => {
  it('updates a reminder status', async () => {
    const { adapter, store } = createAdapter();
    const created = store.create({ text: 'Test', dueAt: '2026-02-22T10:00:00.000Z' });

    const result = await adapter.execute('reminder.update', {
      id: created.id,
      status: 'dismissed',
    });
    expect(result.success).toBe(true);
    const data = result.data as { reminder: { status: string } };
    expect(data.reminder.status).toBe('dismissed');
  });

  it('returns error for non-existent reminder', async () => {
    const { adapter } = createAdapter();
    const result = await adapter.execute('reminder.update', {
      id: 'rem_nonexistent',
      status: 'dismissed',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('REMINDER_NOT_FOUND');
  });

  it('snoozes a reminder with snoozedUntil', async () => {
    const { adapter, store } = createAdapter();
    const created = store.create({ text: 'Snooze me', dueAt: '2026-02-22T10:00:00.000Z' });

    const result = await adapter.execute('reminder.update', {
      id: created.id,
      status: 'snoozed',
      snoozedUntil: '2026-02-22T10:15:00.000Z',
    });
    expect(result.success).toBe(true);
    const data = result.data as { reminder: { status: string; snoozedUntil: string } };
    expect(data.reminder.status).toBe('snoozed');
    expect(data.reminder.snoozedUntil).toBe('2026-02-22T10:15:00.000Z');
  });
});

describe('ReminderAdapter: reminder.list', () => {
  it('lists all reminders with default payload', async () => {
    const { adapter, store } = createAdapter();
    store.create({ text: 'Reminder 1', dueAt: '2026-02-22T10:00:00.000Z' });
    store.create({ text: 'Reminder 2', dueAt: '2026-02-22T11:00:00.000Z' });

    const result = await adapter.execute('reminder.list', {});
    expect(result.success).toBe(true);
    const data = result.data as { reminders: unknown[]; count: number };
    expect(data.reminders).toHaveLength(2);
    expect(data.count).toBe(2);
  });

  it('lists reminders filtered by status', async () => {
    const { adapter, store } = createAdapter();
    store.create({ text: 'Pending', dueAt: '2026-02-22T10:00:00.000Z' });
    const r2 = store.create({ text: 'Dismissed', dueAt: '2026-02-22T11:00:00.000Z' });
    store.update(r2.id, { status: 'dismissed' });

    const result = await adapter.execute('reminder.list', { status: 'pending' });
    expect(result.success).toBe(true);
    const data = result.data as { reminders: unknown[]; count: number };
    expect(data.reminders).toHaveLength(1);
    expect(data.count).toBe(1);
  });

  it('respects limit parameter', async () => {
    const { adapter, store } = createAdapter();
    for (let i = 0; i < 5; i++) {
      store.create({ text: `R${i}`, dueAt: `2026-02-2${i + 1}T10:00:00.000Z` });
    }

    const result = await adapter.execute('reminder.list', { limit: 2 });
    expect(result.success).toBe(true);
    const data = result.data as { reminders: unknown[]; count: number };
    expect(data.reminders).toHaveLength(2);
  });
});

describe('ReminderAdapter: reminder.delete', () => {
  it('deletes a reminder', async () => {
    const { adapter, store } = createAdapter();
    const created = store.create({ text: 'Delete me', dueAt: '2026-02-22T10:00:00.000Z' });

    const result = await adapter.execute('reminder.delete', { id: created.id });
    expect(result.success).toBe(true);
    expect(store.findById(created.id)).toBeNull();
  });

  it('returns error for non-existent reminder', async () => {
    const { adapter } = createAdapter();
    const result = await adapter.execute('reminder.delete', { id: 'rem_nonexistent' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('REMINDER_NOT_FOUND');
  });
});

describe('ReminderAdapter: unsupported actions', () => {
  it('rejects unsupported action types', async () => {
    const { adapter } = createAdapter();
    const result = await adapter.execute('email.fetch', {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_ACTION');
  });
});

describe('ReminderAdapter: error handling', () => {
  it('catches and wraps unexpected errors', async () => {
    const db = new Database(':memory:');
    const store = new ReminderStore(db as unknown as DatabaseHandle);
    const adapter = new ReminderAdapter(store);

    // Close the database to force an error
    db.close();

    const result = await adapter.execute('reminder.create', {
      text: 'Should fail',
      dueAt: '2026-02-22T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('REMINDER_ERROR');
  });
});

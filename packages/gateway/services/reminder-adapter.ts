// Reminder Adapter — Gateway service adapter for reminder CRUD operations.
// Reminders are local-only (no network calls). The adapter pattern is used
// for consistency, audit trail integration, and autonomy tier enforcement.

import type { ActionType, ReminderCreatePayload, ReminderUpdatePayload, ReminderListPayload, ReminderDeletePayload } from '@semblance/core';
import type { ServiceAdapter } from './types.js';
import type { ReminderStore, CreateReminderInput, UpdateReminderInput } from '@semblance/core/knowledge/reminder-store.js';

export class ReminderAdapter implements ServiceAdapter {
  private store: ReminderStore;

  constructor(store: ReminderStore) {
    this.store = store;
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    try {
      switch (action) {
        case 'reminder.create':
          return this.handleCreate(payload as ReminderCreatePayload);
        case 'reminder.update':
          return this.handleUpdate(payload as ReminderUpdatePayload);
        case 'reminder.list':
          return this.handleList(payload as ReminderListPayload);
        case 'reminder.delete':
          return this.handleDelete(payload as ReminderDeletePayload);
        default:
          return {
            success: false,
            error: { code: 'UNSUPPORTED_ACTION', message: `Reminder adapter does not support: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'REMINDER_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private handleCreate(payload: ReminderCreatePayload): {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  } {
    const input: CreateReminderInput = {
      text: payload.text,
      dueAt: payload.dueAt,
      recurrence: payload.recurrence,
      source: payload.source,
    };
    const reminder = this.store.create(input);
    return { success: true, data: { reminder } };
  }

  private handleUpdate(payload: ReminderUpdatePayload): {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  } {
    const input: UpdateReminderInput = {};
    if (payload.text !== undefined) input.text = payload.text;
    if (payload.dueAt !== undefined) input.dueAt = payload.dueAt;
    if (payload.recurrence !== undefined) input.recurrence = payload.recurrence;
    if (payload.status !== undefined) input.status = payload.status;
    if (payload.snoozedUntil !== undefined) input.snoozedUntil = payload.snoozedUntil;

    const reminder = this.store.update(payload.id, input);
    if (!reminder) {
      return {
        success: false,
        error: { code: 'REMINDER_NOT_FOUND', message: `Reminder not found: ${payload.id}` },
      };
    }
    return { success: true, data: { reminder } };
  }

  private handleList(payload: ReminderListPayload): {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  } {
    const limit = payload.limit ?? 50;
    let reminders;

    if (!payload.status || payload.status === 'all') {
      reminders = this.store.findAll(limit);
    } else {
      reminders = this.store.findByStatus(payload.status, limit);
    }

    return { success: true, data: { reminders, count: reminders.length } };
  }

  private handleDelete(payload: ReminderDeletePayload): {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  } {
    const deleted = this.store.delete(payload.id);
    if (!deleted) {
      return {
        success: false,
        error: { code: 'REMINDER_NOT_FOUND', message: `Reminder not found: ${payload.id}` },
      };
    }
    return { success: true, data: { deleted: true } };
  }
}

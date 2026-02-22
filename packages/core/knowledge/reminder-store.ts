// Reminder Store — SQLite storage for reminders with CRUD, snooze, and recurrence.
// Reminders are fully local. No data ever leaves the device.

import type Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    due_at TEXT NOT NULL,
    recurrence TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'pending',
    snoozed_until TEXT,
    source TEXT NOT NULL DEFAULT 'chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
  CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
  CREATE INDEX IF NOT EXISTS idx_reminders_snoozed_until ON reminders(snoozed_until);
`;

export interface ReminderRow {
  id: string;
  text: string;
  due_at: string;
  recurrence: string;
  status: string;
  snoozed_until: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  status: 'pending' | 'fired' | 'dismissed' | 'snoozed';
  snoozedUntil: string | null;
  source: 'chat' | 'quick-capture' | 'proactive';
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderInput {
  text: string;
  dueAt: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  source?: 'chat' | 'quick-capture' | 'proactive';
}

export interface UpdateReminderInput {
  text?: string;
  dueAt?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  status?: 'pending' | 'fired' | 'dismissed' | 'snoozed';
  snoozedUntil?: string | null;
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    text: row.text,
    dueAt: row.due_at,
    recurrence: row.recurrence as Reminder['recurrence'],
    status: row.status as Reminder['status'],
    snoozedUntil: row.snoozed_until,
    source: row.source as Reminder['source'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Compute the next occurrence for a recurring reminder.
 * Returns the new due_at ISO string, or null if non-recurring.
 */
export function computeNextOccurrence(
  dueAt: string,
  recurrence: Reminder['recurrence'],
): string | null {
  if (recurrence === 'none') return null;

  const date = new Date(dueAt);
  switch (recurrence) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
  }
  return date.toISOString();
}

export class ReminderStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_TABLES);
  }

  create(input: CreateReminderInput): Reminder {
    const now = new Date().toISOString();
    const id = `rem_${nanoid()}`;
    const recurrence = input.recurrence ?? 'none';
    const source = input.source ?? 'chat';

    this.db.prepare(`
      INSERT INTO reminders (id, text, due_at, recurrence, status, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, input.text, input.dueAt, recurrence, source, now, now);

    return this.findById(id)!;
  }

  update(id: string, input: UpdateReminderInput): Reminder | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const text = input.text ?? existing.text;
    const dueAt = input.dueAt ?? existing.dueAt;
    const recurrence = input.recurrence ?? existing.recurrence;
    const status = input.status ?? existing.status;
    const snoozedUntil = input.snoozedUntil !== undefined
      ? input.snoozedUntil
      : existing.snoozedUntil;

    this.db.prepare(`
      UPDATE reminders
      SET text = ?, due_at = ?, recurrence = ?, status = ?, snoozed_until = ?, updated_at = ?
      WHERE id = ?
    `).run(text, dueAt, recurrence, status, snoozedUntil, now, id);

    return this.findById(id)!;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
    return result.changes > 0;
  }

  findById(id: string): Reminder | null {
    const row = this.db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as ReminderRow | undefined;
    return row ? rowToReminder(row) : null;
  }

  findByStatus(status: Reminder['status'], limit: number = 50): Reminder[] {
    const rows = this.db.prepare(
      'SELECT * FROM reminders WHERE status = ? ORDER BY due_at ASC LIMIT ?'
    ).all(status, limit) as ReminderRow[];
    return rows.map(rowToReminder);
  }

  /**
   * Find reminders that are due (due_at <= now AND status = 'pending').
   */
  findDue(now?: string): Reminder[] {
    const timestamp = now ?? new Date().toISOString();
    const rows = this.db.prepare(
      'SELECT * FROM reminders WHERE due_at <= ? AND status = \'pending\' ORDER BY due_at ASC'
    ).all(timestamp) as ReminderRow[];
    return rows.map(rowToReminder);
  }

  /**
   * Find snoozed reminders that should be reactivated (snoozed_until <= now).
   */
  findSnoozedReady(now?: string): Reminder[] {
    const timestamp = now ?? new Date().toISOString();
    const rows = this.db.prepare(
      'SELECT * FROM reminders WHERE status = \'snoozed\' AND snoozed_until IS NOT NULL AND snoozed_until <= ? ORDER BY snoozed_until ASC'
    ).all(timestamp) as ReminderRow[];
    return rows.map(rowToReminder);
  }

  /**
   * Reactivate a snoozed reminder: set status back to 'pending', clear snoozed_until.
   */
  reactivate(id: string): Reminder | null {
    return this.update(id, { status: 'pending', snoozedUntil: null });
  }

  /**
   * Snooze a reminder until a specified time.
   */
  snooze(id: string, snoozedUntil: string): Reminder | null {
    return this.update(id, { status: 'snoozed', snoozedUntil });
  }

  /**
   * Fire a reminder and create the next occurrence if recurring.
   * Returns the fired reminder and optionally the new occurrence.
   */
  fire(id: string): { fired: Reminder; next: Reminder | null } | null {
    const reminder = this.findById(id);
    if (!reminder) return null;

    // Mark as fired
    const fired = this.update(id, { status: 'fired' })!;

    // Create next occurrence if recurring
    const nextDueAt = computeNextOccurrence(reminder.dueAt, reminder.recurrence);
    let next: Reminder | null = null;
    if (nextDueAt) {
      next = this.create({
        text: reminder.text,
        dueAt: nextDueAt,
        recurrence: reminder.recurrence,
        source: reminder.source,
      });
    }

    return { fired, next };
  }

  findAll(limit: number = 50): Reminder[] {
    const rows = this.db.prepare(
      'SELECT * FROM reminders ORDER BY due_at ASC LIMIT ?'
    ).all(limit) as ReminderRow[];
    return rows.map(rowToReminder);
  }

  count(status?: Reminder['status']): number {
    if (status) {
      const row = this.db.prepare(
        'SELECT COUNT(*) as count FROM reminders WHERE status = ?'
      ).get(status) as { count: number };
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM reminders').get() as { count: number };
    return row.count;
  }
}

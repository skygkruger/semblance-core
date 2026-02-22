// Capture Store — SQLite storage for quick captures with context linking.
// Captures are fully local. No data ever leaves the device.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    reminder_id TEXT,
    linked_context TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_captures_created_at ON captures(created_at);
  CREATE INDEX IF NOT EXISTS idx_captures_processed ON captures(processed);
`;

export interface CaptureRow {
  id: string;
  text: string;
  created_at: string;
  processed: number;
  reminder_id: string | null;
  linked_context: string;
}

export interface Capture {
  id: string;
  text: string;
  createdAt: string;
  processed: boolean;
  reminderId: string | null;
  linkedContext: LinkedContextRef[];
}

export interface LinkedContextRef {
  documentId: string;
  title: string;
  source: string;
  score: number;
}

export interface CreateCaptureInput {
  text: string;
  reminderId?: string;
  linkedContext?: LinkedContextRef[];
}

function rowToCapture(row: CaptureRow): Capture {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    processed: row.processed === 1,
    reminderId: row.reminder_id,
    linkedContext: JSON.parse(row.linked_context) as LinkedContextRef[],
  };
}

export class CaptureStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLES);
  }

  create(input: CreateCaptureInput): Capture {
    const id = nanoid();
    const now = new Date().toISOString();
    const linkedContext = input.linkedContext ?? [];

    this.db.prepare(`
      INSERT INTO captures (id, text, created_at, processed, reminder_id, linked_context)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.text,
      now,
      linkedContext.length > 0 || input.reminderId ? 1 : 0,
      input.reminderId ?? null,
      JSON.stringify(linkedContext),
    );

    return {
      id,
      text: input.text,
      createdAt: now,
      processed: linkedContext.length > 0 || !!input.reminderId,
      reminderId: input.reminderId ?? null,
      linkedContext,
    };
  }

  findById(id: string): Capture | null {
    const row = this.db.prepare('SELECT * FROM captures WHERE id = ?').get(id) as CaptureRow | undefined;
    return row ? rowToCapture(row) : null;
  }

  findAll(limit = 50, offset = 0): Capture[] {
    const rows = this.db.prepare(
      'SELECT * FROM captures ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as CaptureRow[];
    return rows.map(rowToCapture);
  }

  findUnprocessed(): Capture[] {
    const rows = this.db.prepare(
      'SELECT * FROM captures WHERE processed = 0 ORDER BY created_at ASC'
    ).all() as CaptureRow[];
    return rows.map(rowToCapture);
  }

  markProcessed(id: string, reminderId?: string, linkedContext?: LinkedContextRef[]): boolean {
    const updates: string[] = ['processed = 1'];
    const params: unknown[] = [];

    if (reminderId !== undefined) {
      updates.push('reminder_id = ?');
      params.push(reminderId);
    }
    if (linkedContext !== undefined) {
      updates.push('linked_context = ?');
      params.push(JSON.stringify(linkedContext));
    }

    params.push(id);
    const result = this.db.prepare(
      `UPDATE captures SET ${updates.join(', ')} WHERE id = ?`
    ).run(...params);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM captures WHERE id = ?').run(id);
    return result.changes > 0;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM captures').get() as { count: number };
    return row.count;
  }
}

// Bureaucracy Tracker — Tracks form submissions, expected timelines,
// and follow-up reminders. Reuses the FollowUpTracker escalation pattern.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { FormSubmission, FormSubmissionStatus } from './types.js';

// ─── SQLite Schema ───────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY,
    form_name TEXT NOT NULL,
    template_id TEXT,
    filled_at TEXT NOT NULL,
    submitted_at TEXT,
    expected_response_days INTEGER NOT NULL DEFAULT 14,
    status TEXT NOT NULL DEFAULT 'filled',
    notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_form_status ON form_submissions(status);
`;

interface SubmissionRow {
  id: string;
  form_name: string;
  template_id: string | null;
  filled_at: string;
  submitted_at: string | null;
  expected_response_days: number;
  status: string;
  notes: string | null;
}

function rowToSubmission(row: SubmissionRow): FormSubmission {
  return {
    id: row.id,
    formName: row.form_name,
    templateId: row.template_id ?? undefined,
    filledAt: row.filled_at,
    submittedAt: row.submitted_at ?? undefined,
    expectedResponseDays: row.expected_response_days,
    status: row.status as FormSubmissionStatus,
    notes: row.notes ?? undefined,
  };
}

// ─── Bureaucracy Tracker ────────────────────────────────────────────────────

export class BureaucracyTracker {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  /**
   * Create a new form submission entry.
   */
  createSubmission(data: {
    formName: string;
    templateId?: string;
    expectedResponseDays: number;
    notes?: string;
  }): FormSubmission {
    const id = `fs_${nanoid()}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO form_submissions
        (id, form_name, template_id, filled_at, expected_response_days, status, notes)
      VALUES (?, ?, ?, ?, ?, 'filled', ?)
    `).run(id, data.formName, data.templateId ?? null, now, data.expectedResponseDays, data.notes ?? null);

    return {
      id,
      formName: data.formName,
      templateId: data.templateId,
      filledAt: now,
      expectedResponseDays: data.expectedResponseDays,
      status: 'filled',
      notes: data.notes,
    };
  }

  /**
   * Get a submission by ID.
   */
  getSubmission(id: string): FormSubmission | null {
    const row = this.db.prepare(
      'SELECT * FROM form_submissions WHERE id = ?'
    ).get(id) as SubmissionRow | undefined;
    return row ? rowToSubmission(row) : null;
  }

  /**
   * Mark a submission as submitted (user confirms they submitted the form).
   */
  markSubmitted(id: string, date?: string): void {
    const submittedAt = date ?? new Date().toISOString();
    this.db.prepare(
      "UPDATE form_submissions SET status = 'submitted', submitted_at = ? WHERE id = ?"
    ).run(submittedAt, id);
  }

  /**
   * Get submissions that need follow-up (past expected response time).
   */
  getDueReminders(): FormSubmission[] {
    const now = new Date();
    const rows = this.db.prepare(
      `SELECT * FROM form_submissions
       WHERE status IN ('submitted', 'follow-up-sent')
       AND submitted_at IS NOT NULL
       ORDER BY submitted_at ASC`
    ).all() as SubmissionRow[];

    return rows
      .filter(row => {
        if (!row.submitted_at) return false;
        const submittedDate = new Date(row.submitted_at);
        const daysSince = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysSince >= row.expected_response_days;
      })
      .map(rowToSubmission);
  }

  /**
   * Get all pending (non-resolved) submissions.
   */
  getPendingSubmissions(): FormSubmission[] {
    const rows = this.db.prepare(
      `SELECT * FROM form_submissions
       WHERE status NOT IN ('resolved')
       ORDER BY filled_at DESC`
    ).all() as SubmissionRow[];
    return rows.map(rowToSubmission);
  }

  /**
   * Mark a submission as resolved.
   */
  markResolved(id: string): void {
    this.db.prepare(
      "UPDATE form_submissions SET status = 'resolved' WHERE id = ?"
    ).run(id);
  }

  /**
   * Mark a submission as needing attention.
   */
  markNeedsAttention(id: string): void {
    this.db.prepare(
      "UPDATE form_submissions SET status = 'needs-attention' WHERE id = ?"
    ).run(id);
  }

  /**
   * Get submission statistics.
   */
  getStats(): { filled: number; submitted: number; overdue: number; resolved: number } {
    const filled = (this.db.prepare(
      "SELECT COUNT(*) as c FROM form_submissions WHERE status = 'filled'"
    ).get() as { c: number }).c;

    const submitted = (this.db.prepare(
      "SELECT COUNT(*) as c FROM form_submissions WHERE status IN ('submitted', 'follow-up-sent')"
    ).get() as { c: number }).c;

    const overdue = this.getDueReminders().length;

    const resolved = (this.db.prepare(
      "SELECT COUNT(*) as c FROM form_submissions WHERE status = 'resolved'"
    ).get() as { c: number }).c;

    return { filled, submitted, overdue, resolved };
  }
}

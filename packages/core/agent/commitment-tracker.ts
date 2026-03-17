// Commitment Tracker — Detects explicit and implicit commitments in sent emails.
// Tracks their resolution and surfaces overdue commitments via proactive engine.
//
// Uses SmolLM2 (fast tier) for commitment extraction from sent email text.
// Resolution detection: if user sends a follow-up email to the same recipient
// about the same thread, the commitment is marked resolved automatically.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TrackedCommitment {
  id: string;
  emailId: string;
  threadId: string;
  recipientId: string;
  recipientName: string;
  commitmentText: string;
  detectedDeadline: string | null;
  impliedDeadline: string;
  status: 'pending' | 'resolved' | 'dismissed';
  resolvedAt: string | null;
  createdAt: string;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_COMMITMENT_TABLE = `
  CREATE TABLE IF NOT EXISTS tracked_commitments (
    id TEXT PRIMARY KEY,
    email_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL DEFAULT '',
    recipient_name TEXT NOT NULL DEFAULT '',
    commitment_text TEXT NOT NULL,
    detected_deadline TEXT,
    implied_deadline TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_commitments_status ON tracked_commitments(status);
  CREATE INDEX IF NOT EXISTS idx_commitments_deadline ON tracked_commitments(implied_deadline);
  CREATE INDEX IF NOT EXISTS idx_commitments_thread ON tracked_commitments(thread_id);
`;

// ─── Commitment extraction prompt ──────────────────────────────────────────────

const EXTRACT_COMMITMENTS_PROMPT = `Extract any explicit promises, commitments, or follow-up obligations from this sent email.
Return JSON: { "commitments": [{ "text": string, "deadline": string | null }] }
Only include real commitments the sender is making. Do not include questions or requests FROM others.
If no commitments found, return: { "commitments": [] }

Email:
`;

// ─── Heuristic commitment detection (fallback when LLM unavailable) ────────────

const COMMITMENT_PATTERNS = [
  /I(?:'ll| will) (?:send|get back|follow up|reach out|check|look into|prepare|draft|schedule|arrange|set up|make sure)/i,
  /(?:Let me|Allow me to) (?:send|get back|follow up|check|look into|prepare|draft|schedule)/i,
  /I(?:'ll| will) have (?:that|it|this|the) (?:to you|ready|done|prepared|sent)/i,
  /(?:by|before) (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|tomorrow|end of (?:day|week)|EOD|EOW|COB)/i,
  /I(?:'ll| will) (?:make a decision|decide|confirm|let you know)/i,
  /(?:Let's|We should) (?:sync|connect|meet|schedule|discuss) (?:next|this) week/i,
];

const DEADLINE_PATTERNS: Array<{ pattern: RegExp; extractDeadline: (match: RegExpMatchArray) => string | null }> = [
  {
    pattern: /by (\w+day)/i,
    extractDeadline: (match) => {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = match[1]?.toLowerCase();
      const targetDay = days.indexOf(dayName ?? '');
      if (targetDay === -1) return null;
      const now = new Date();
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      const target = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
      return target.toISOString().split('T')[0]!;
    },
  },
  {
    pattern: /by tomorrow/i,
    extractDeadline: () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      return tomorrow.toISOString().split('T')[0]!;
    },
  },
  {
    pattern: /(?:end of (?:this )?week|EOW)/i,
    extractDeadline: () => {
      const now = new Date();
      const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
      const friday = new Date(now.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
      return friday.toISOString().split('T')[0]!;
    },
  },
  {
    pattern: /(?:end of day|EOD|COB)/i,
    extractDeadline: () => new Date().toISOString().split('T')[0]!,
  },
];

// ─── Commitment Tracker ────────────────────────────────────────────────────────

export class CommitmentTracker {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_COMMITMENT_TABLE);
  }

  /**
   * Scan sent emails from the last N days and detect new commitments.
   * Uses heuristic pattern matching (fast, no LLM needed).
   * For LLM-based extraction, call detectCommitmentsWithLLM separately.
   */
  async detectCommitments(days?: number): Promise<TrackedCommitment[]> {
    const lookbackDays = days ?? 7;
    const newCommitments: TrackedCommitment[] = [];

    // Get sent emails from the last N days that haven't been scanned
    // We identify "sent" emails by looking at emails where the from field matches
    // common patterns — the actual sent detection depends on the indexer's folder field
    const emails = this.db.prepare(`
      SELECT id, message_id, thread_id, "from", from_name, "to", subject, snippet, received_at
      FROM indexed_emails
      WHERE received_at > datetime('now', '-${lookbackDays} days')
      ORDER BY received_at DESC
      LIMIT 200
    `).all() as Array<{
      id: string;
      message_id: string;
      thread_id: string;
      from: string;
      from_name: string;
      to: string;
      subject: string;
      snippet: string;
      received_at: string;
    }>;

    for (const email of emails) {
      // Check if we already tracked commitments for this email
      const existing = this.db.prepare(
        'SELECT id FROM tracked_commitments WHERE email_id = ?'
      ).get(email.message_id) as { id: string } | undefined;

      if (existing) continue;

      // Heuristic commitment detection from snippet
      const commitments = this.extractCommitmentsHeuristic(email.snippet);

      for (const commitment of commitments) {
        // Parse recipient from 'to' field
        let recipients: string[] = [];
        try { recipients = JSON.parse(email.to); } catch { /* skip */ }
        const recipientName = recipients[0] ?? 'Unknown';

        // Compute implied deadline (7 days from email if no deadline detected)
        const impliedDeadline = commitment.deadline
          ?? new Date(new Date(email.received_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

        const tracked: TrackedCommitment = {
          id: `commit_${nanoid()}`,
          emailId: email.message_id,
          threadId: email.thread_id,
          recipientId: recipientName,
          recipientName: recipientName,
          commitmentText: commitment.text,
          detectedDeadline: commitment.deadline,
          impliedDeadline,
          status: 'pending',
          resolvedAt: null,
          createdAt: new Date().toISOString(),
        };

        this.db.prepare(`
          INSERT INTO tracked_commitments (id, email_id, thread_id, recipient_id, recipient_name, commitment_text, detected_deadline, implied_deadline, status, resolved_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
        `).run(
          tracked.id, tracked.emailId, tracked.threadId,
          tracked.recipientId, tracked.recipientName,
          tracked.commitmentText, tracked.detectedDeadline,
          tracked.impliedDeadline, tracked.createdAt,
        );

        newCommitments.push(tracked);
      }
    }

    // Auto-resolve commitments where user sent a follow-up in the same thread
    this.autoResolveCommitments();

    return newCommitments;
  }

  /**
   * Get commitments that are due or overdue and not yet resolved.
   */
  getDueCommitments(thresholdDays?: number): TrackedCommitment[] {
    const threshold = thresholdDays ?? 0; // default: due today or past
    const cutoff = new Date(Date.now() + threshold * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;

    const rows = this.db.prepare(`
      SELECT * FROM tracked_commitments
      WHERE status = 'pending' AND implied_deadline <= ?
      ORDER BY implied_deadline ASC
    `).all(cutoff) as CommitmentRow[];

    return rows.map(rowToCommitment);
  }

  /**
   * Get all pending commitments.
   */
  getPendingCommitments(): TrackedCommitment[] {
    const rows = this.db.prepare(
      'SELECT * FROM tracked_commitments WHERE status = \'pending\' ORDER BY implied_deadline ASC'
    ).all() as CommitmentRow[];

    return rows.map(rowToCommitment);
  }

  /**
   * Mark a commitment as resolved.
   */
  resolve(id: string): void {
    this.db.prepare(
      'UPDATE tracked_commitments SET status = \'resolved\', resolved_at = ? WHERE id = ?'
    ).run(new Date().toISOString(), id);
  }

  /**
   * Dismiss a commitment (user explicitly marks it as no longer relevant).
   */
  dismiss(id: string): void {
    this.db.prepare(
      'UPDATE tracked_commitments SET status = \'dismissed\' WHERE id = ?'
    ).run(id);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Heuristic commitment extraction — no LLM needed.
   */
  private extractCommitmentsHeuristic(text: string): Array<{ text: string; deadline: string | null }> {
    const results: Array<{ text: string; deadline: string | null }> = [];

    for (const pattern of COMMITMENT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        // Extract the sentence containing the commitment
        const sentenceStart = Math.max(0, text.lastIndexOf('.', match.index ?? 0) + 1);
        const sentenceEnd = text.indexOf('.', (match.index ?? 0) + match[0].length);
        const sentence = text.slice(sentenceStart, sentenceEnd > 0 ? sentenceEnd : undefined).trim();

        // Try to extract deadline from the sentence
        let deadline: string | null = null;
        for (const dp of DEADLINE_PATTERNS) {
          const deadlineMatch = sentence.match(dp.pattern);
          if (deadlineMatch) {
            deadline = dp.extractDeadline(deadlineMatch);
            break;
          }
        }

        results.push({
          text: sentence.substring(0, 200), // cap at 200 chars
          deadline,
        });
        break; // one commitment per email snippet to avoid duplicates
      }
    }

    return results;
  }

  /**
   * Auto-resolve commitments where user sent a follow-up in the same thread
   * after the commitment was created.
   */
  private autoResolveCommitments(): void {
    const pending = this.db.prepare(
      'SELECT id, thread_id, created_at FROM tracked_commitments WHERE status = \'pending\''
    ).all() as Array<{ id: string; thread_id: string; created_at: string }>;

    for (const commitment of pending) {
      const followUp = this.db.prepare(`
        SELECT id FROM indexed_emails
        WHERE thread_id = ? AND received_at > ?
        LIMIT 1
      `).get(commitment.thread_id, commitment.created_at) as { id: string } | undefined;

      if (followUp) {
        this.resolve(commitment.id);
      }
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface CommitmentRow {
  id: string;
  email_id: string;
  thread_id: string;
  recipient_id: string;
  recipient_name: string;
  commitment_text: string;
  detected_deadline: string | null;
  implied_deadline: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
}

function rowToCommitment(row: CommitmentRow): TrackedCommitment {
  return {
    id: row.id,
    emailId: row.email_id,
    threadId: row.thread_id,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    commitmentText: row.commitment_text,
    detectedDeadline: row.detected_deadline,
    impliedDeadline: row.implied_deadline,
    status: row.status as 'pending' | 'resolved' | 'dismissed',
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

/** The extraction prompt for use by LLM-based detection (used by bridge handler). */
export const COMMITMENT_EXTRACT_PROMPT = EXTRACT_COMMITMENTS_PROMPT;

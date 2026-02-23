// Follow-Up Tracker — Manages escalation timeline for representative actions.
// Day 3 → follow-up-1, Day 7 → follow-up-2, Day 14 → needs-attention.
// Max 2 automated follow-ups before flagging for human attention.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { FollowUp, FollowUpStage } from './types.js';

// ─── Escalation Timeline ─────────────────────────────────────────────────────

const FOLLOW_UP_DAYS = {
  'follow-up-1': 3,
  'follow-up-2': 7,
  'needs-attention': 14,
} as const;

const MAX_AUTOMATED_FOLLOW_UPS = 2;

// ─── SQLite Schema ───────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS representative_follow_ups (
    id TEXT PRIMARY KEY,
    action_id TEXT NOT NULL,
    merchant_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'initial',
    follow_up_count INTEGER NOT NULL DEFAULT 0,
    max_follow_ups INTEGER NOT NULL DEFAULT ${MAX_AUTOMATED_FOLLOW_UPS},
    next_follow_up_at TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_followup_action ON representative_follow_ups(action_id);
  CREATE INDEX IF NOT EXISTS idx_followup_stage ON representative_follow_ups(stage);
`;

interface FollowUpRow {
  id: string;
  action_id: string;
  merchant_name: string;
  subject: string;
  stage: string;
  follow_up_count: number;
  max_follow_ups: number;
  next_follow_up_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

function rowToFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    actionId: row.action_id,
    merchantName: row.merchant_name,
    subject: row.subject,
    stage: row.stage as FollowUpStage,
    followUpCount: row.follow_up_count,
    maxFollowUps: row.max_follow_ups,
    nextFollowUpAt: row.next_follow_up_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

export class FollowUpTracker {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  /**
   * Create a new follow-up entry for a representative action.
   */
  createFollowUp(actionId: string, merchantName: string, subject: string): FollowUp {
    const id = `fu_${nanoid()}`;
    const now = new Date().toISOString();
    const nextFollowUp = addDays(now, FOLLOW_UP_DAYS['follow-up-1']);

    this.db.prepare(`
      INSERT INTO representative_follow_ups
        (id, action_id, merchant_name, subject, stage, follow_up_count, max_follow_ups, next_follow_up_at, created_at)
      VALUES (?, ?, ?, ?, 'initial', 0, ?, ?, ?)
    `).run(id, actionId, merchantName, subject, MAX_AUTOMATED_FOLLOW_UPS, nextFollowUp, now);

    return {
      id,
      actionId,
      merchantName,
      subject,
      stage: 'initial',
      followUpCount: 0,
      maxFollowUps: MAX_AUTOMATED_FOLLOW_UPS,
      nextFollowUpAt: nextFollowUp,
      createdAt: now,
      resolvedAt: null,
    };
  }

  /**
   * Get a follow-up by ID.
   */
  getFollowUp(id: string): FollowUp | null {
    const row = this.db.prepare(
      'SELECT * FROM representative_follow_ups WHERE id = ?'
    ).get(id) as FollowUpRow | undefined;
    return row ? rowToFollowUp(row) : null;
  }

  /**
   * Get all follow-ups that are due for action (next_follow_up_at <= now).
   */
  getDueFollowUps(): FollowUp[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(
      `SELECT * FROM representative_follow_ups
       WHERE resolved_at IS NULL
         AND next_follow_up_at IS NOT NULL
         AND next_follow_up_at <= ?
         AND stage != 'needs-attention'
       ORDER BY next_follow_up_at ASC`
    ).all(now) as FollowUpRow[];
    return rows.map(rowToFollowUp);
  }

  /**
   * Get all pending (unresolved) follow-ups.
   */
  getPendingFollowUps(): FollowUp[] {
    const rows = this.db.prepare(
      `SELECT * FROM representative_follow_ups
       WHERE resolved_at IS NULL
       ORDER BY created_at DESC`
    ).all() as FollowUpRow[];
    return rows.map(rowToFollowUp);
  }

  /**
   * Record that a follow-up email was sent. Advances the stage.
   */
  recordFollowUpSent(id: string): FollowUp | null {
    const followUp = this.getFollowUp(id);
    if (!followUp || followUp.resolvedAt) return null;

    const newCount = followUp.followUpCount + 1;
    let newStage: FollowUpStage;
    let nextFollowUp: string | null;

    if (newCount >= MAX_AUTOMATED_FOLLOW_UPS) {
      // Max follow-ups reached — schedule needs-attention
      newStage = `follow-up-${newCount}` as FollowUpStage;
      nextFollowUp = addDays(new Date().toISOString(), FOLLOW_UP_DAYS['needs-attention'] - FOLLOW_UP_DAYS['follow-up-2']);
    } else {
      newStage = `follow-up-${newCount}` as FollowUpStage;
      const nextKey = `follow-up-${newCount + 1}` as keyof typeof FOLLOW_UP_DAYS;
      const currentKey = `follow-up-${newCount}` as keyof typeof FOLLOW_UP_DAYS;
      const daysUntilNext = (FOLLOW_UP_DAYS[nextKey] ?? FOLLOW_UP_DAYS['needs-attention']) - (FOLLOW_UP_DAYS[currentKey] ?? 0);
      nextFollowUp = addDays(new Date().toISOString(), daysUntilNext);
    }

    this.db.prepare(
      `UPDATE representative_follow_ups
       SET stage = ?, follow_up_count = ?, next_follow_up_at = ?
       WHERE id = ?`
    ).run(newStage, newCount, nextFollowUp, id);

    return this.getFollowUp(id);
  }

  /**
   * Mark a follow-up as resolved.
   */
  markResolved(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE representative_follow_ups
       SET stage = 'resolved', resolved_at = ?, next_follow_up_at = NULL
       WHERE id = ?`
    ).run(now, id);
  }

  /**
   * Mark a follow-up as needing human attention.
   */
  markNeedsAttention(id: string): void {
    this.db.prepare(
      `UPDATE representative_follow_ups
       SET stage = 'needs-attention', next_follow_up_at = NULL
       WHERE id = ?`
    ).run(id);
  }

  /**
   * Get follow-up statistics.
   */
  getStats(): { pending: number; needsAttention: number; resolved: number } {
    const pending = (this.db.prepare(
      `SELECT COUNT(*) as c FROM representative_follow_ups
       WHERE resolved_at IS NULL AND stage != 'needs-attention'`
    ).get() as { c: number }).c;

    const needsAttention = (this.db.prepare(
      `SELECT COUNT(*) as c FROM representative_follow_ups WHERE stage = 'needs-attention'`
    ).get() as { c: number }).c;

    const resolved = (this.db.prepare(
      `SELECT COUNT(*) as c FROM representative_follow_ups WHERE stage = 'resolved'`
    ).get() as { c: number }).c;

    return { pending, needsAttention, resolved };
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

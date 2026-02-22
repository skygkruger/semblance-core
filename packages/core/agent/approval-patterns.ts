// Approval Pattern Tracker — Tracks user approval/rejection patterns per action subtype.
//
// AUTONOMOUS DECISION: SubType derivation is kept simple for Step 6. For email.send,
// subType is 'reply' if replyToMessageId is present, 'new' otherwise. For archive,
// subType is 'archive'. This data foundation powers Step 7 autonomy escalation prompts.
// Reasoning: Simple subtypes cover the main use cases; refinement comes in Step 7.
// Escalation check: Build prompt explicitly authorizes this as Step 7 data foundation.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { ActionType } from '../types/ipc.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalPattern {
  actionType: string;
  subType: string;
  consecutiveApprovals: number;
  totalApprovals: number;
  totalRejections: number;
  lastApprovalAt: string | null;
  lastRejectionAt: string | null;
  autoExecuteThreshold: number;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_APPROVAL_PATTERNS_TABLE = `
  CREATE TABLE IF NOT EXISTS approval_patterns (
    action_type TEXT NOT NULL,
    sub_type TEXT NOT NULL,
    consecutive_approvals INTEGER NOT NULL DEFAULT 0,
    total_approvals INTEGER NOT NULL DEFAULT 0,
    total_rejections INTEGER NOT NULL DEFAULT 0,
    last_approval_at TEXT,
    last_rejection_at TEXT,
    auto_execute_threshold INTEGER NOT NULL DEFAULT 3,
    PRIMARY KEY (action_type, sub_type)
  );
`;

// ─── SubType Derivation ────────────────────────────────────────────────────────

/**
 * Derive a subType from the action type and payload.
 * This determines the granularity of approval pattern tracking.
 */
export function deriveSubType(actionType: ActionType, payload: Record<string, unknown>): string {
  switch (actionType) {
    case 'email.send':
      return payload['replyToMessageId'] ? 'reply' : 'new';
    case 'email.draft':
      return payload['replyToMessageId'] ? 'reply_draft' : 'new_draft';
    case 'email.archive':
      return 'archive';
    case 'email.move':
      return `move_to_${(payload['toFolder'] as string) ?? 'unknown'}`;
    case 'email.markRead':
      return (payload['read'] as boolean) ? 'mark_read' : 'mark_unread';
    case 'calendar.create':
      return 'create_event';
    case 'calendar.update':
      return 'update_event';
    case 'calendar.delete':
      return 'delete_event';
    default:
      return 'default';
  }
}

// ─── Approval Pattern Tracker ──────────────────────────────────────────────────

export class ApprovalPatternTracker {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_APPROVAL_PATTERNS_TABLE);
  }

  /**
   * Record an approval for an action subtype.
   * Increments consecutive and total approvals.
   */
  recordApproval(actionType: ActionType, payload: Record<string, unknown>): void {
    const subType = deriveSubType(actionType, payload);
    const now = new Date().toISOString();

    const existing = this.db.prepare(
      'SELECT consecutive_approvals, total_approvals FROM approval_patterns WHERE action_type = ? AND sub_type = ?'
    ).get(actionType, subType) as { consecutive_approvals: number; total_approvals: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE approval_patterns SET
          consecutive_approvals = consecutive_approvals + 1,
          total_approvals = total_approvals + 1,
          last_approval_at = ?
        WHERE action_type = ? AND sub_type = ?
      `).run(now, actionType, subType);
    } else {
      this.db.prepare(`
        INSERT INTO approval_patterns (action_type, sub_type, consecutive_approvals, total_approvals, last_approval_at)
        VALUES (?, ?, 1, 1, ?)
      `).run(actionType, subType, now);
    }
  }

  /**
   * Record a rejection for an action subtype.
   * Resets consecutive approvals to 0.
   */
  recordRejection(actionType: ActionType, payload: Record<string, unknown>): void {
    const subType = deriveSubType(actionType, payload);
    const now = new Date().toISOString();

    const existing = this.db.prepare(
      'SELECT total_rejections FROM approval_patterns WHERE action_type = ? AND sub_type = ?'
    ).get(actionType, subType) as { total_rejections: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE approval_patterns SET
          consecutive_approvals = 0,
          total_rejections = total_rejections + 1,
          last_rejection_at = ?
        WHERE action_type = ? AND sub_type = ?
      `).run(now, actionType, subType);
    } else {
      this.db.prepare(`
        INSERT INTO approval_patterns (action_type, sub_type, consecutive_approvals, total_rejections, last_rejection_at)
        VALUES (?, ?, 0, 1, ?)
      `).run(actionType, subType, now);
    }
  }

  /**
   * Check if an action subtype has been approved enough times to be considered "routine".
   * Returns true if consecutiveApprovals >= autoExecuteThreshold.
   */
  isRoutine(actionType: ActionType, payload: Record<string, unknown>): boolean {
    const subType = deriveSubType(actionType, payload);

    const row = this.db.prepare(
      'SELECT consecutive_approvals, auto_execute_threshold FROM approval_patterns WHERE action_type = ? AND sub_type = ?'
    ).get(actionType, subType) as { consecutive_approvals: number; auto_execute_threshold: number } | undefined;

    if (!row) return false;
    return row.consecutive_approvals >= row.auto_execute_threshold;
  }

  /**
   * Get the approval pattern for a specific action subtype.
   */
  getPattern(actionType: ActionType, payload: Record<string, unknown>): ApprovalPattern | null {
    const subType = deriveSubType(actionType, payload);

    const row = this.db.prepare(
      'SELECT * FROM approval_patterns WHERE action_type = ? AND sub_type = ?'
    ).get(actionType, subType) as {
      action_type: string;
      sub_type: string;
      consecutive_approvals: number;
      total_approvals: number;
      total_rejections: number;
      last_approval_at: string | null;
      last_rejection_at: string | null;
      auto_execute_threshold: number;
    } | undefined;

    if (!row) return null;

    return {
      actionType: row.action_type,
      subType: row.sub_type,
      consecutiveApprovals: row.consecutive_approvals,
      totalApprovals: row.total_approvals,
      totalRejections: row.total_rejections,
      lastApprovalAt: row.last_approval_at,
      lastRejectionAt: row.last_rejection_at,
      autoExecuteThreshold: row.auto_execute_threshold,
    };
  }

  /**
   * Get the consecutive approval count for display in the PendingActionBanner.
   * Returns 0 if no pattern exists.
   */
  getConsecutiveApprovals(actionType: ActionType, payload: Record<string, unknown>): number {
    const subType = deriveSubType(actionType, payload);

    const row = this.db.prepare(
      'SELECT consecutive_approvals FROM approval_patterns WHERE action_type = ? AND sub_type = ?'
    ).get(actionType, subType) as { consecutive_approvals: number } | undefined;

    return row?.consecutive_approvals ?? 0;
  }

  /**
   * Get the threshold for an action subtype.
   */
  getThreshold(actionType: ActionType, payload: Record<string, unknown>): number {
    const subType = deriveSubType(actionType, payload);

    const row = this.db.prepare(
      'SELECT auto_execute_threshold FROM approval_patterns WHERE action_type = ? AND sub_type = ?'
    ).get(actionType, subType) as { auto_execute_threshold: number } | undefined;

    return row?.auto_execute_threshold ?? 3;
  }

  /**
   * Get all tracked patterns (for debugging and Step 7 escalation logic).
   */
  getAllPatterns(): ApprovalPattern[] {
    const rows = this.db.prepare('SELECT * FROM approval_patterns ORDER BY action_type, sub_type').all() as Array<{
      action_type: string;
      sub_type: string;
      consecutive_approvals: number;
      total_approvals: number;
      total_rejections: number;
      last_approval_at: string | null;
      last_rejection_at: string | null;
      auto_execute_threshold: number;
    }>;

    return rows.map(r => ({
      actionType: r.action_type,
      subType: r.sub_type,
      consecutiveApprovals: r.consecutive_approvals,
      totalApprovals: r.total_approvals,
      totalRejections: r.total_rejections,
      lastApprovalAt: r.last_approval_at,
      lastRejectionAt: r.last_rejection_at,
      autoExecuteThreshold: r.auto_execute_threshold,
    }));
  }
}

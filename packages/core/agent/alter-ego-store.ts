// Alter Ego Store — SQLite persistence for guardrail state.
//
// Manages 4 tables: settings, trust, action log (receipts), and anomalies.
// Follows ContactStore / IntentManager pattern: constructor creates tables,
// methods use prepared statements, WAL mode.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type {
  AlterEgoSettings,
  AlterEgoTrust,
  AlterEgoReceipt,
  AlterEgoAnomaly,
} from './alter-ego-types.js';

// ─── Constants (hardcoded, not configurable) ────────────────────────────────

export const TRUST_THRESHOLD = 3;
export const UNDO_WINDOW_MS = 30_000;

// ─── SQLite Schema ──────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS alter_ego_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dollar_threshold REAL NOT NULL DEFAULT 50.0,
    confirmation_disabled_categories TEXT NOT NULL DEFAULT '[]'
  );

  INSERT OR IGNORE INTO alter_ego_settings (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS alter_ego_trust (
    contact_email TEXT NOT NULL,
    scope TEXT NOT NULL,
    successful_sends INTEGER NOT NULL DEFAULT 0,
    last_send_at TEXT,
    PRIMARY KEY (contact_email, scope)
  );

  CREATE TABLE IF NOT EXISTS alter_ego_action_log (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('executed', 'undone')),
    undo_available INTEGER NOT NULL DEFAULT 1,
    undo_expires_at TEXT,
    week_group TEXT NOT NULL,
    created_at TEXT NOT NULL,
    executed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ae_log_week_group ON alter_ego_action_log(week_group);
  CREATE INDEX IF NOT EXISTS idx_ae_log_executed_at ON alter_ego_action_log(executed_at);

  CREATE TABLE IF NOT EXISTS alter_ego_anomalies (
    action_type TEXT PRIMARY KEY,
    first_seen_at TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0
  );
`;

// ─── Row Types ──────────────────────────────────────────────────────────────

interface SettingsRow {
  dollar_threshold: number;
  confirmation_disabled_categories: string;
}

interface TrustRow {
  contact_email: string;
  scope: string;
  successful_sends: number;
  last_send_at: string | null;
}

interface ReceiptRow {
  id: string;
  action_type: string;
  summary: string;
  reasoning: string;
  status: string;
  undo_available: number;
  undo_expires_at: string | null;
  week_group: string;
  created_at: string;
  executed_at: string;
}

interface AnomalyRow {
  action_type: string;
  first_seen_at: string;
  acknowledged: number;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export class AlterEgoStore {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLES);
  }

  // ─── Settings ───────────────────────────────────────────────────────────

  getSettings(): AlterEgoSettings {
    const row = this.db.prepare(
      'SELECT dollar_threshold, confirmation_disabled_categories FROM alter_ego_settings WHERE id = 1'
    ).get() as SettingsRow | undefined;

    if (!row) {
      return { dollarThreshold: 50.0, confirmationDisabledCategories: [] };
    }

    return {
      dollarThreshold: row.dollar_threshold,
      confirmationDisabledCategories: JSON.parse(row.confirmation_disabled_categories) as string[],
    };
  }

  updateSettings(partial: Partial<AlterEgoSettings>): void {
    const current = this.getSettings();

    const threshold = partial.dollarThreshold ?? current.dollarThreshold;
    const categories = partial.confirmationDisabledCategories ?? current.confirmationDisabledCategories;

    this.db.prepare(
      'UPDATE alter_ego_settings SET dollar_threshold = ?, confirmation_disabled_categories = ? WHERE id = 1'
    ).run(threshold, JSON.stringify(categories));
  }

  // ─── Trust ──────────────────────────────────────────────────────────────

  getTrust(email: string, scope: string): AlterEgoTrust {
    const row = this.db.prepare(
      'SELECT * FROM alter_ego_trust WHERE contact_email = ? AND scope = ?'
    ).get(email.toLowerCase(), scope) as TrustRow | undefined;

    if (!row) {
      return {
        contactEmail: email.toLowerCase(),
        scope,
        successfulSends: 0,
        lastSendAt: null,
        trusted: false,
      };
    }

    return {
      contactEmail: row.contact_email,
      scope: row.scope,
      successfulSends: row.successful_sends,
      lastSendAt: row.last_send_at,
      trusted: row.successful_sends >= TRUST_THRESHOLD,
    };
  }

  incrementTrust(email: string, scope: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO alter_ego_trust (contact_email, scope, successful_sends, last_send_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT (contact_email, scope)
      DO UPDATE SET successful_sends = successful_sends + 1, last_send_at = ?
    `).run(email.toLowerCase(), scope, now, now);
  }

  isTrusted(email: string, scope: string): boolean {
    const trust = this.getTrust(email, scope);
    return trust.trusted;
  }

  // ─── Receipts ───────────────────────────────────────────────────────────

  logReceipt(receipt: AlterEgoReceipt): void {
    this.db.prepare(`
      INSERT INTO alter_ego_action_log (
        id, action_type, summary, reasoning, status,
        undo_available, undo_expires_at, week_group, created_at, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      receipt.id,
      receipt.actionType,
      receipt.summary,
      receipt.reasoning,
      receipt.status,
      receipt.undoAvailable ? 1 : 0,
      receipt.undoExpiresAt,
      receipt.weekGroup,
      receipt.createdAt,
      receipt.executedAt,
    );
  }

  markUndone(id: string): boolean {
    const result = this.db.prepare(
      'UPDATE alter_ego_action_log SET status = ?, undo_available = 0 WHERE id = ?'
    ).run('undone', id);
    return result.changes > 0;
  }

  getReceipts(weekGroup?: string): AlterEgoReceipt[] {
    let rows: ReceiptRow[];
    if (weekGroup) {
      rows = this.db.prepare(
        'SELECT * FROM alter_ego_action_log WHERE week_group = ? ORDER BY executed_at DESC'
      ).all(weekGroup) as ReceiptRow[];
    } else {
      rows = this.db.prepare(
        'SELECT * FROM alter_ego_action_log ORDER BY executed_at DESC'
      ).all() as ReceiptRow[];
    }
    return rows.map(rowToReceipt);
  }

  getRecentReceipts(limit: number): AlterEgoReceipt[] {
    const rows = this.db.prepare(
      'SELECT * FROM alter_ego_action_log ORDER BY executed_at DESC LIMIT ?'
    ).all(limit) as ReceiptRow[];
    return rows.map(rowToReceipt);
  }

  // ─── Anomalies ──────────────────────────────────────────────────────────

  isNovelAction(actionType: string): boolean {
    const row = this.db.prepare(
      'SELECT acknowledged FROM alter_ego_anomalies WHERE action_type = ?'
    ).get(actionType) as AnomalyRow | undefined;

    if (!row) {
      // First time seeing this action — record it and report as novel
      this.db.prepare(
        'INSERT OR IGNORE INTO alter_ego_anomalies (action_type, first_seen_at, acknowledged) VALUES (?, ?, 0)'
      ).run(actionType, new Date().toISOString());
      return true;
    }

    // If acknowledged, it's no longer novel
    return row.acknowledged === 0;
  }

  acknowledgeAnomaly(actionType: string): void {
    this.db.prepare(
      'UPDATE alter_ego_anomalies SET acknowledged = 1 WHERE action_type = ?'
    ).run(actionType);
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get ISO week group string for a date: YYYY-Www (e.g., "2026-W09").
   * ISO 8601: week starts on Monday.
   */
  getWeekGroup(date: Date): string {
    // Use UTC throughout to avoid timezone-dependent results
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Set to nearest Thursday: current date + 4 - current day number (Mon=1..Sun=7)
    const dayNum = d.getUTCDay() || 7; // Sunday = 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  /**
   * Get aggregate counts for receipts in a given week group.
   */
  getWeekStats(weekGroupOrStart: string, weekEnd?: string): { executed: number; undone: number; batched: number } {
    let executedCount: number;
    let undoneCount: number;
    let batchedCount: number;

    if (weekEnd) {
      // Date range query — used by weekly digest
      const executed = this.db.prepare(
        'SELECT COUNT(*) as count FROM alter_ego_action_log WHERE created_at >= ? AND created_at <= ? AND status = ?'
      ).get(weekGroupOrStart, weekEnd, 'executed') as { count: number };
      const undone = this.db.prepare(
        'SELECT COUNT(*) as count FROM alter_ego_action_log WHERE created_at >= ? AND created_at <= ? AND status = ?'
      ).get(weekGroupOrStart, weekEnd, 'undone') as { count: number };

      executedCount = executed.count;
      undoneCount = undone.count;

      // Count batched items from pending_actions table (if it exists)
      try {
        const batched = this.db.prepare(
          "SELECT COUNT(*) as count FROM pending_actions WHERE created_at >= ? AND created_at <= ? AND tier = 'alter_ego'"
        ).get(weekGroupOrStart, weekEnd) as { count: number };
        batchedCount = batched.count;
      } catch {
        batchedCount = 0;
      }
    } else {
      // Week group query — used by morning brief
      const executed = this.db.prepare(
        'SELECT COUNT(*) as count FROM alter_ego_action_log WHERE week_group = ? AND status = ?'
      ).get(weekGroupOrStart, 'executed') as { count: number };
      const undone = this.db.prepare(
        'SELECT COUNT(*) as count FROM alter_ego_action_log WHERE week_group = ? AND status = ?'
      ).get(weekGroupOrStart, 'undone') as { count: number };

      executedCount = executed.count;
      undoneCount = undone.count;
      batchedCount = 0; // Not available via week group query
    }

    return {
      executed: executedCount,
      undone: undoneCount,
      batched: batchedCount,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rowToReceipt(row: ReceiptRow): AlterEgoReceipt {
  return {
    id: row.id,
    actionType: row.action_type as AlterEgoReceipt['actionType'],
    summary: row.summary,
    reasoning: row.reasoning,
    status: row.status as AlterEgoReceipt['status'],
    undoAvailable: row.undo_available === 1,
    undoExpiresAt: row.undo_expires_at,
    weekGroup: row.week_group,
    createdAt: row.created_at,
    executedAt: row.executed_at,
  };
}

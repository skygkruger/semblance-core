// Preference Graph — Stores how the user behaves, not what they know.
// Detected from behavioral signals across the knowledge graph and hardware event stream.
// Never manually configured — always learned. Confidence-weighted with evidence tracking.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PreferenceNode {
  id: string;
  domain: string;
  pattern: string;
  confidence: number;
  evidenceCount: number;
  lastObservedAt: string;
  actionType: string | null;
  override: boolean;
  overrideValue: boolean | null;
  createdAt: string;
}

export interface PreferenceSignal {
  domain: string;
  pattern: string;
  actionType?: string;
  confidence: number;
  evidence: Record<string, unknown>;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_PREFERENCE_TABLES = `
  CREATE TABLE IF NOT EXISTS preference_nodes (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    pattern TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    evidence_count INTEGER NOT NULL DEFAULT 1,
    last_observed_at TEXT NOT NULL,
    action_type TEXT,
    override INTEGER NOT NULL DEFAULT 0,
    override_value INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_prefs_domain ON preference_nodes(domain);
  CREATE INDEX IF NOT EXISTS idx_prefs_confidence ON preference_nodes(confidence DESC);
`;

// ─── Preference Graph ──────────────────────────────────────────────────────────

export class PreferenceGraph {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_PREFERENCE_TABLES);
  }

  /**
   * Detect and update preferences from a behavioral signal.
   * If a matching preference exists, update its confidence using exponential moving average.
   * If no match, create a new preference node.
   */
  recordSignal(signal: PreferenceSignal): void {
    const existing = this.db.prepare(
      'SELECT * FROM preference_nodes WHERE domain = ? AND pattern = ?'
    ).get(signal.domain, signal.pattern) as {
      id: string;
      confidence: number;
      evidence_count: number;
      override: number;
    } | undefined;

    const now = new Date().toISOString();

    if (existing) {
      // Don't update overridden preferences
      if (existing.override === 1) return;

      // Exponential moving average: new = existing * 0.9 + signal * 0.1
      const newConfidence = existing.confidence * 0.9 + signal.confidence * 0.1;
      const clampedConfidence = Math.min(1.0, Math.max(0.0, newConfidence));

      this.db.prepare(
        'UPDATE preference_nodes SET confidence = ?, evidence_count = ?, last_observed_at = ? WHERE id = ?'
      ).run(clampedConfidence, existing.evidence_count + 1, now, existing.id);
    } else {
      const id = `pref_${nanoid()}`;
      this.db.prepare(`
        INSERT INTO preference_nodes (id, domain, pattern, confidence, evidence_count, last_observed_at, action_type, override, override_value, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, 0, NULL, ?)
      `).run(id, signal.domain, signal.pattern, signal.confidence, now, signal.actionType ?? null, now);
    }
  }

  /**
   * Get preferences for a domain above a confidence threshold.
   */
  getPreferences(domain: string, minConfidence?: number): PreferenceNode[] {
    const threshold = minConfidence ?? 0.3;
    const rows = this.db.prepare(
      'SELECT * FROM preference_nodes WHERE domain = ? AND confidence >= ? AND (override = 0 OR override_value = 1) ORDER BY confidence DESC'
    ).all(domain, threshold) as PreferenceRow[];

    return rows.map(rowToNode);
  }

  /**
   * Get all high-confidence preferences (confidence >= 0.85).
   */
  getHighConfidencePreferences(): PreferenceNode[] {
    const rows = this.db.prepare(
      'SELECT * FROM preference_nodes WHERE confidence >= 0.85 AND (override = 0 OR override_value = 1) ORDER BY confidence DESC'
    ).all() as PreferenceRow[];

    return rows.map(rowToNode);
  }

  /**
   * Get all preferences above threshold, grouped by domain.
   */
  getAllPreferences(minConfidence?: number): PreferenceNode[] {
    const threshold = minConfidence ?? 0.3;
    const rows = this.db.prepare(
      'SELECT * FROM preference_nodes WHERE confidence >= ? ORDER BY domain, confidence DESC'
    ).all(threshold) as PreferenceRow[];

    return rows.map(rowToNode);
  }

  /**
   * User confirms a detected preference (sets confidence = 1.0, override = true).
   */
  confirmPreference(id: string): void {
    this.db.prepare(
      'UPDATE preference_nodes SET confidence = 1.0, override = 1, override_value = 1 WHERE id = ?'
    ).run(id);
  }

  /**
   * User denies a detected preference (tombstones it, excludes from future detection).
   */
  denyPreference(id: string): void {
    this.db.prepare(
      'UPDATE preference_nodes SET override = 1, override_value = 0, confidence = 0.0 WHERE id = ?'
    ).run(id);
  }

  /**
   * Query: given an action type, does any high-confidence preference suggest
   * auto-approval? Returns the preference node if yes, null if no.
   */
  shouldAutoApprove(actionType: string, _context: Record<string, unknown>): PreferenceNode | null {
    const row = this.db.prepare(
      'SELECT * FROM preference_nodes WHERE action_type = ? AND confidence >= 0.85 AND (override = 0 OR override_value = 1) ORDER BY confidence DESC LIMIT 1'
    ).get(actionType) as PreferenceRow | undefined;

    if (!row) return null;
    return rowToNode(row);
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

interface PreferenceRow {
  id: string;
  domain: string;
  pattern: string;
  confidence: number;
  evidence_count: number;
  last_observed_at: string;
  action_type: string | null;
  override: number;
  override_value: number | null;
  created_at: string;
}

function rowToNode(row: PreferenceRow): PreferenceNode {
  return {
    id: row.id,
    domain: row.domain,
    pattern: row.pattern,
    confidence: row.confidence,
    evidenceCount: row.evidence_count,
    lastObservedAt: row.last_observed_at,
    actionType: row.action_type,
    override: row.override === 1,
    overrideValue: row.override_value === null ? null : row.override_value === 1,
    createdAt: row.created_at,
  };
}

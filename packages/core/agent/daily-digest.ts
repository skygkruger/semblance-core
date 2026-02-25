// Daily Digest Generator — Aggregates daily action stats from the audit trail.
//
// Pure aggregation + template. No LLM call. The daily digest summarizes
// what Semblance did today and how much time it saved the user.

import { nanoid } from 'nanoid';
import type { DatabaseHandle } from '../platform/types.js';
import type { ComparisonStatement } from '../privacy/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DailyDigest {
  id: string;
  date: string; // ISO date (YYYY-MM-DD)
  totalActions: number;
  actionsByType: Record<string, number>;
  totalTimeSavedSeconds: number;
  timeSavedFormatted: string;
  emailsHandled: number;
  meetingsPrepped: number;
  followUpsTracked: number;
  remindersCreated: number;
  webSearches: number;
  summary: string;
  dismissed: boolean;
}

export interface DailyDigestPreferences {
  enabled: boolean;
  time: string; // HH:MM (24-hour format)
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS daily_digests (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    generated_at TEXT NOT NULL,
    total_actions INTEGER NOT NULL DEFAULT 0,
    actions_by_type TEXT NOT NULL DEFAULT '{}',
    total_time_saved_seconds INTEGER NOT NULL DEFAULT 0,
    emails_handled INTEGER NOT NULL DEFAULT 0,
    meetings_prepped INTEGER NOT NULL DEFAULT 0,
    follow_ups_tracked INTEGER NOT NULL DEFAULT 0,
    reminders_created INTEGER NOT NULL DEFAULT 0,
    web_searches INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    dismissed INTEGER NOT NULL DEFAULT 0
  );
`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function buildSummary(digest: {
  emailsHandled: number;
  meetingsPrepped: number;
  followUpsTracked: number;
  remindersCreated: number;
  webSearches: number;
  timeSavedFormatted: string;
}): string {
  const parts: string[] = [];
  if (digest.emailsHandled > 0) parts.push(`${digest.emailsHandled} emails handled`);
  if (digest.meetingsPrepped > 0) parts.push(`${digest.meetingsPrepped} meetings prepped`);
  if (digest.followUpsTracked > 0) parts.push(`${digest.followUpsTracked} follow-ups tracked`);
  if (digest.remindersCreated > 0) parts.push(`${digest.remindersCreated} reminders created`);
  if (digest.webSearches > 0) parts.push(`${digest.webSearches} web searches`);

  if (parts.length === 0) return 'No actions today.';

  return `Today: ${parts.join(', ')}. Time saved: ~${digest.timeSavedFormatted}.`;
}

function getDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

// ─── Action Type Categorization ──────────────────────────────────────────────

function categorizeAction(actionType: string): {
  emailsHandled: number;
  meetingsPrepped: number;
  followUpsTracked: number;
  remindersCreated: number;
  webSearches: number;
} {
  const counts = {
    emailsHandled: 0,
    meetingsPrepped: 0,
    followUpsTracked: 0,
    remindersCreated: 0,
    webSearches: 0,
  };

  if (actionType.startsWith('email.')) counts.emailsHandled = 1;
  else if (actionType.startsWith('calendar.')) counts.meetingsPrepped = 1;
  else if (actionType === 'reminder.create') counts.remindersCreated = 1;
  else if (actionType.startsWith('reminder.')) counts.followUpsTracked = 1;
  else if (actionType.startsWith('web.')) counts.webSearches = 1;

  return counts;
}

// ─── Generator ──────────────────────────────────────────────────────────────

/** Provider interface for comparison statement (avoids importing full privacy module). */
export interface ComparisonStatementProvider {
  getComparisonStatementOnly(): Promise<ComparisonStatement>;
}

export class DailyDigestGenerator {
  private db: DatabaseHandle;
  private initialized = false;
  private onPreferenceChanged?: (prefs: DailyDigestPreferences) => void;
  private comparisonStatementProvider?: ComparisonStatementProvider;

  constructor(db: DatabaseHandle, options?: {
    onPreferenceChanged?: (prefs: DailyDigestPreferences) => void;
    comparisonStatementProvider?: ComparisonStatementProvider;
  }) {
    this.db = db;
    this.db.exec(CREATE_TABLES);
    this.initialized = true;
    this.onPreferenceChanged = options?.onPreferenceChanged;
    this.comparisonStatementProvider = options?.comparisonStatementProvider;
  }

  /**
   * Generate the daily digest for a given date.
   * Idempotent: returns existing digest if already generated.
   */
  generate(date: Date = new Date()): DailyDigest {
    const dateStr = getDateString(date);

    // Check if already generated
    const existing = this.getByDate(dateStr);
    if (existing) return existing;

    // Query audit trail for today's actions
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    let rows: Array<{ action: string; estimated_time_saved_seconds: number }>;
    try {
      rows = this.db.prepare(
        `SELECT action, estimated_time_saved_seconds
         FROM audit_trail
         WHERE timestamp >= ? AND timestamp <= ?
         AND status = 'success'`
      ).all(dayStart, dayEnd) as typeof rows;
    } catch {
      // audit_trail table may not exist yet
      rows = [];
    }

    // Aggregate
    const actionsByType: Record<string, number> = {};
    let totalTimeSaved = 0;
    let emailsHandled = 0;
    let meetingsPrepped = 0;
    let followUpsTracked = 0;
    let remindersCreated = 0;
    let webSearches = 0;

    for (const row of rows) {
      actionsByType[row.action] = (actionsByType[row.action] ?? 0) + 1;
      totalTimeSaved += row.estimated_time_saved_seconds ?? 0;

      const cat = categorizeAction(row.action);
      emailsHandled += cat.emailsHandled;
      meetingsPrepped += cat.meetingsPrepped;
      followUpsTracked += cat.followUpsTracked;
      remindersCreated += cat.remindersCreated;
      webSearches += cat.webSearches;
    }

    const timeSavedFormatted = formatTimeSaved(totalTimeSaved);
    const summary = buildSummary({
      emailsHandled, meetingsPrepped, followUpsTracked,
      remindersCreated, webSearches, timeSavedFormatted,
    });

    const digest: DailyDigest = {
      id: nanoid(),
      date: dateStr,
      totalActions: rows.length,
      actionsByType,
      totalTimeSavedSeconds: totalTimeSaved,
      timeSavedFormatted,
      emailsHandled,
      meetingsPrepped,
      followUpsTracked,
      remindersCreated,
      webSearches,
      summary,
      dismissed: false,
    };

    // Store
    this.db.prepare(
      `INSERT INTO daily_digests (id, date, generated_at, total_actions, actions_by_type, total_time_saved_seconds,
       emails_handled, meetings_prepped, follow_ups_tracked, reminders_created, web_searches, summary, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      digest.id, digest.date, new Date().toISOString(), digest.totalActions,
      JSON.stringify(digest.actionsByType), digest.totalTimeSavedSeconds,
      digest.emailsHandled, digest.meetingsPrepped, digest.followUpsTracked,
      digest.remindersCreated, digest.webSearches, digest.summary,
    );

    return digest;
  }

  /**
   * Generate the daily digest with an appended comparison statement.
   * Async because comparison generation may query data stores.
   * Falls back to regular generate() if comparison provider is absent or errors.
   */
  async generateWithComparison(date: Date = new Date()): Promise<DailyDigest> {
    const digest = this.generate(date);

    if (!this.comparisonStatementProvider) return digest;

    try {
      const comparison = await this.comparisonStatementProvider.getComparisonStatementOnly();
      if (comparison.summaryText && comparison.totalDataPoints > 0) {
        digest.summary = `${digest.summary}\n\n${comparison.summaryText}`;
      }
    } catch {
      // Comparison provider error should never break digest generation
    }

    return digest;
  }

  /**
   * Get today's digest (null if not yet generated).
   */
  getToday(): DailyDigest | null {
    return this.getByDate(getDateString());
  }

  /**
   * Get digest for a specific date.
   */
  getByDate(dateStr: string): DailyDigest | null {
    const row = this.db.prepare(
      'SELECT * FROM daily_digests WHERE date = ?'
    ).get(dateStr) as {
      id: string;
      date: string;
      total_actions: number;
      actions_by_type: string;
      total_time_saved_seconds: number;
      emails_handled: number;
      meetings_prepped: number;
      follow_ups_tracked: number;
      reminders_created: number;
      web_searches: number;
      summary: string;
      dismissed: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      date: row.date,
      totalActions: row.total_actions,
      actionsByType: JSON.parse(row.actions_by_type) as Record<string, number>,
      totalTimeSavedSeconds: row.total_time_saved_seconds,
      timeSavedFormatted: formatTimeSaved(row.total_time_saved_seconds),
      emailsHandled: row.emails_handled,
      meetingsPrepped: row.meetings_prepped,
      followUpsTracked: row.follow_ups_tracked,
      remindersCreated: row.reminders_created,
      webSearches: row.web_searches,
      summary: row.summary,
      dismissed: row.dismissed === 1,
    };
  }

  /**
   * Dismiss today's digest.
   */
  dismiss(digestId: string): void {
    this.db.prepare(
      'UPDATE daily_digests SET dismissed = 1 WHERE id = ?'
    ).run(digestId);
  }

  /**
   * Get daily digest preferences.
   */
  getPreferences(): DailyDigestPreferences {
    try {
      const row = this.db.prepare(
        "SELECT value FROM preferences WHERE key = 'daily_digest_prefs'"
      ).get() as { value: string } | undefined;

      if (row) {
        return JSON.parse(row.value) as DailyDigestPreferences;
      }
    } catch {
      // preferences table may not exist
    }
    return { enabled: true, time: '08:00' };
  }

  /**
   * Save daily digest preferences.
   * Triggers sync callback if configured.
   */
  setPreferences(prefs: DailyDigestPreferences): void {
    // Ensure preferences table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    this.db.prepare(
      `INSERT OR REPLACE INTO preferences (key, value) VALUES ('daily_digest_prefs', ?)`
    ).run(JSON.stringify(prefs));

    this.onPreferenceChanged?.(prefs);
  }
}

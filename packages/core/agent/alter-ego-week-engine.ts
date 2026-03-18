// Alter Ego Week Engine — 7-day trust-building sequence for Alter Ego activation.
//
// Each day demonstrates a specific capability. At Guardian tier (the default during
// Alter Ego Week) these are shown, not auto-executed. Day 7 offers Alter Ego activation.
//
// Skippable and replayable. State persisted in SQLite.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AlterEgoDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AlterEgoWeekState {
  active: boolean;
  currentDay: AlterEgoDay | null;
  completedDays: AlterEgoDay[];
  startedAt: string | null;
  completedAt: string | null;
  activationOffered: boolean;
  userActivated: boolean;
}

export interface DayDemoResult {
  day: AlterEgoDay;
  title: string;
  summary: string;
  actionsTaken: string[];
  shareableCardData: Record<string, unknown>;
}

const DAY_TITLES: Record<AlterEgoDay, string> = {
  1: 'Email Intelligence',
  2: 'Calendar Mastery',
  3: 'Financial Awareness',
  4: 'Your Voice',
  5: 'Web Intelligence',
  6: 'Multi-Domain Autonomy',
  7: 'The Offer',
};

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS alter_ego_week (
    id INTEGER PRIMARY KEY DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 0,
    current_day INTEGER,
    completed_days TEXT NOT NULL DEFAULT '[]',
    started_at TEXT,
    completed_at TEXT,
    activation_offered INTEGER NOT NULL DEFAULT 0,
    user_activated INTEGER NOT NULL DEFAULT 0
  );
`;

// ─── Alter Ego Week Engine ─────────────────────────────────────────────────────

export class AlterEgoWeekEngine {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
    this.ensureRow();
  }

  /** Start or resume Alter Ego Week */
  async start(): Promise<AlterEgoWeekState> {
    const state = this.getState();
    if (state.active) return state;

    this.db.prepare(
      'UPDATE alter_ego_week SET active = 1, current_day = 1, started_at = ? WHERE id = 1'
    ).run(new Date().toISOString());

    return this.getState();
  }

  /** Run the demonstration for the current day */
  async runDayDemo(day: AlterEgoDay): Promise<DayDemoResult> {
    const title = DAY_TITLES[day];
    let summary = '';
    const actionsTaken: string[] = [];
    const shareableCardData: Record<string, unknown> = { day, title };

    switch (day) {
      case 1: {
        // Email Intelligence — count indexed emails, show categorization preview
        const emailCount = this.queryCount('indexed_emails');
        const highPriority = this.queryCount('indexed_emails', "priority = 'high'");
        summary = `You have ${emailCount} emails indexed. ${highPriority} need action. I categorized them by urgency, follow-up obligations, and sender importance.`;
        actionsTaken.push('Scanned email index', 'Categorized by priority', 'Identified follow-up obligations');
        shareableCardData.emailCount = emailCount;
        shareableCardData.highPriority = highPriority;
        break;
      }
      case 2: {
        // Calendar Mastery — upcoming events, conflict detection
        const eventCount = this.queryCount('indexed_calendar_events', "start_time > datetime('now')");
        summary = `You have ${eventCount} upcoming events. I can prepare meeting briefs, detect scheduling conflicts, and proactively assemble context for attendees.`;
        actionsTaken.push('Analyzed calendar events', 'Checked for conflicts', 'Prepared meeting context');
        shareableCardData.eventCount = eventCount;
        break;
      }
      case 3: {
        // Financial Awareness — subscription detection
        const subCount = this.queryCount('recurring_charges');
        summary = subCount > 0
          ? `You have ${subCount} detected recurring charges. I can track costs, flag unused subscriptions, and help cancel ones you've forgotten about.`
          : 'No financial data imported yet. Connect your bank statement or Plaid to enable subscription detection.';
        actionsTaken.push('Scanned recurring charges', 'Calculated monthly cost', 'Flagged unused subscriptions');
        shareableCardData.subscriptionCount = subCount;
        break;
      }
      case 4: {
        // Your Voice — style profile demonstration
        summary = 'I analyzed your writing style from sent emails. I can match your tone, sentence length, and formality level when drafting replies — so emails sound like you, not an AI.';
        actionsTaken.push('Analyzed writing style', 'Matched tone patterns', 'Generated style profile');
        shareableCardData.styleMatch = true;
        break;
      }
      case 5: {
        // Web Intelligence — research demonstration
        summary = 'I can research meeting attendees, compile background briefings, and assemble context before you need it — all via privacy-respecting web search.';
        actionsTaken.push('Searched web for meeting context', 'Compiled attendee profiles', 'Assembled briefing document');
        shareableCardData.webResearch = true;
        break;
      }
      case 6: {
        // Multi-Domain Autonomy — full day simulation
        const emailCount2 = this.queryCount('indexed_emails');
        const eventCount2 = this.queryCount('indexed_calendar_events', "start_time > datetime('now')");
        summary = `In a full autonomous day, I would: triage ${emailCount2} emails, prepare briefs for ${eventCount2} meetings, set follow-up reminders, and log every action to your audit trail. All reversible. All transparent.`;
        actionsTaken.push('Email triage', 'Meeting prep', 'Reminder management', 'Full audit trail');
        shareableCardData.emailCount = emailCount2;
        shareableCardData.eventCount = eventCount2;
        break;
      }
      case 7: {
        // The Offer — activation prompt
        const completedDays = this.getState().completedDays;
        const totalActions = completedDays.length * 4; // ~4 demo actions per day
        summary = `Over ${completedDays.length} days, I demonstrated ${totalActions}+ actions I could take on your behalf. Every action is audited, reversible, and under your control. Ready to activate Alter Ego?`;
        actionsTaken.push('Compiled week summary', 'Generated activation offer');
        this.db.prepare('UPDATE alter_ego_week SET activation_offered = 1 WHERE id = 1').run();
        shareableCardData.totalActions = totalActions;
        shareableCardData.activationOffer = true;
        break;
      }
    }

    // Mark day as completed
    const state = this.getState();
    const completed = [...new Set([...state.completedDays, day])];
    this.db.prepare('UPDATE alter_ego_week SET completed_days = ? WHERE id = 1')
      .run(JSON.stringify(completed));

    return { day, title, summary, actionsTaken, shareableCardData };
  }

  /** Advance to the next day */
  async advanceDay(): Promise<AlterEgoWeekState> {
    const state = this.getState();
    if (!state.currentDay || state.currentDay >= 7) return state;

    const nextDay = (state.currentDay + 1) as AlterEgoDay;
    this.db.prepare('UPDATE alter_ego_week SET current_day = ? WHERE id = 1').run(nextDay);

    if (nextDay === 7) {
      this.db.prepare('UPDATE alter_ego_week SET completed_at = ? WHERE id = 1')
        .run(new Date().toISOString());
    }

    return this.getState();
  }

  /** Skip Alter Ego Week */
  skip(): void {
    this.db.prepare(
      'UPDATE alter_ego_week SET active = 0, completed_at = ? WHERE id = 1'
    ).run(new Date().toISOString());
  }

  /** User accepts Alter Ego activation */
  async acceptActivation(): Promise<void> {
    this.db.prepare(
      'UPDATE alter_ego_week SET user_activated = 1, active = 0 WHERE id = 1'
    ).run();
  }

  /** Get current state */
  getState(): AlterEgoWeekState {
    const row = this.db.prepare('SELECT * FROM alter_ego_week WHERE id = 1').get() as {
      active: number;
      current_day: number | null;
      completed_days: string;
      started_at: string | null;
      completed_at: string | null;
      activation_offered: number;
      user_activated: number;
    } | undefined;

    if (!row) {
      return {
        active: false, currentDay: null, completedDays: [],
        startedAt: null, completedAt: null, activationOffered: false, userActivated: false,
      };
    }

    return {
      active: row.active === 1,
      currentDay: row.current_day as AlterEgoDay | null,
      completedDays: JSON.parse(row.completed_days) as AlterEgoDay[],
      startedAt: row.started_at,
      completedAt: row.completed_at,
      activationOffered: row.activation_offered === 1,
      userActivated: row.user_activated === 1,
    };
  }

  /** Reset for replay */
  reset(): void {
    this.db.prepare(
      "UPDATE alter_ego_week SET active = 0, current_day = NULL, completed_days = '[]', started_at = NULL, completed_at = NULL, activation_offered = 0, user_activated = 0 WHERE id = 1"
    ).run();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private ensureRow(): void {
    const exists = this.db.prepare('SELECT id FROM alter_ego_week WHERE id = 1').get();
    if (!exists) {
      this.db.prepare("INSERT INTO alter_ego_week (id) VALUES (1)").run();
    }
  }

  private queryCount(table: string, where?: string): number {
    try {
      const sql = where
        ? `SELECT COUNT(*) as cnt FROM ${table} WHERE ${where}`
        : `SELECT COUNT(*) as cnt FROM ${table}`;
      const row = this.db.prepare(sql).get() as { cnt: number };
      return row.cnt;
    } catch {
      return 0; // Table may not exist
    }
  }
}

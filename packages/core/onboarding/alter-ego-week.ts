// Alter Ego Week — 7-day structured onboarding for Alter Ego mode.
//
// Each day demonstrates a domain-specific Alter Ego capability.
// Day 7 offers full activation. Users can skip, replay, or complete.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AlterEgoWeekDay {
  day: number;
  theme: string;
  domain: string;
  type: string;
  description: string;
}

export interface AlterEgoWeekProgress {
  isActive: boolean;
  currentDay: number;
  completedDays: number[];
  totalDays: number;
  startedAt: string | null;
  completedAt: string | null;
  skipped: boolean;
}

export interface DemonstrationConfig {
  day: number;
  theme: string;
  domain: string;
  type: string;
  description: string;
  actions: string[];
}

// ─── 7-Day Sequence ─────────────────────────────────────────────────────────

const ALTER_EGO_WEEK_DAYS: DemonstrationConfig[] = [
  {
    day: 1,
    theme: 'Email Intelligence',
    domain: 'email',
    type: 'email_triage',
    description: 'Watch Semblance triage your inbox — archiving, flagging, and drafting responses.',
    actions: ['email.markRead', 'email.archive', 'email.draft'],
  },
  {
    day: 2,
    theme: 'Calendar Mastery',
    domain: 'calendar',
    type: 'calendar_resolution',
    description: 'See how Semblance resolves scheduling conflicts and preps for meetings.',
    actions: ['calendar.update', 'calendar.create'],
  },
  {
    day: 3,
    theme: 'Financial Awareness',
    domain: 'finances',
    type: 'financial_scan',
    description: 'Semblance identifies forgotten subscriptions and spending patterns.',
    actions: ['finance.fetch_transactions'],
  },
  {
    day: 4,
    theme: 'Your Voice',
    domain: 'email',
    type: 'style_draft',
    description: 'Semblance drafts emails in your writing style. Review and refine.',
    actions: ['email.draft', 'email.send'],
  },
  {
    day: 5,
    theme: 'Research Assistant',
    domain: 'web',
    type: 'research',
    description: 'Ask Semblance to research a topic and see how it searches and synthesizes.',
    actions: ['web.search', 'web.fetch'],
  },
  {
    day: 6,
    theme: 'Multi-Domain',
    domain: 'system',
    type: 'multi_domain',
    description: 'Semblance works across email, calendar, and web simultaneously.',
    actions: ['email.draft', 'calendar.update', 'web.search'],
  },
  {
    day: 7,
    theme: 'The Offer',
    domain: 'system',
    type: 'activation_offer',
    description: 'Review your week. See what Semblance did. Choose to activate Alter Ego.',
    actions: [],
  },
];

// ─── Schema ─────────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS alter_ego_week (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    current_day INTEGER NOT NULL DEFAULT 1,
    completed_days TEXT NOT NULL DEFAULT '[]',
    skipped INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  );
`;

// ─── AlterEgoWeek ──────────────────────────────────────────────────────────

export class AlterEgoWeek {
  private db: DatabaseHandle;

  constructor(deps: { db: DatabaseHandle }) {
    this.db = deps.db;
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Start the Alter Ego Week. Idempotent: if already started, returns existing.
   */
  start(): AlterEgoWeekProgress {
    const existing = this.getActiveRow();
    if (existing) {
      return this.rowToProgress(existing);
    }

    const id = `aew_${nanoid()}`;
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO alter_ego_week (id, started_at, current_day, completed_days, skipped)
       VALUES (?, ?, 1, '[]', 0)`
    ).run(id, now);

    return {
      isActive: true,
      currentDay: 1,
      completedDays: [],
      totalDays: 7,
      startedAt: now,
      completedAt: null,
      skipped: false,
    };
  }

  /**
   * Get the current day's demonstration config.
   */
  getCurrentDay(): DemonstrationConfig | null {
    const row = this.getActiveRow();
    if (!row) return null;

    const dayIndex = row.current_day - 1;
    return ALTER_EGO_WEEK_DAYS[dayIndex] ?? null;
  }

  /**
   * Complete a day and advance to the next.
   */
  completeDay(day: number): AlterEgoWeekProgress | null {
    const row = this.getActiveRow();
    if (!row) return null;

    const completedDays = JSON.parse(row.completed_days) as number[];
    if (!completedDays.includes(day)) {
      completedDays.push(day);
    }

    const nextDay = day + 1;
    const isComplete = nextDay > 7;
    const now = new Date().toISOString();

    if (isComplete) {
      this.db.prepare(
        `UPDATE alter_ego_week SET completed_days = ?, current_day = 7, completed_at = ? WHERE id = ?`
      ).run(JSON.stringify(completedDays), now, row.id);
    } else {
      this.db.prepare(
        `UPDATE alter_ego_week SET completed_days = ?, current_day = ? WHERE id = ?`
      ).run(JSON.stringify(completedDays), nextDay, row.id);
    }

    const updated = this.getRow(row.id)!;
    return this.rowToProgress(updated);
  }

  /**
   * Skip the Alter Ego Week.
   */
  skip(): void {
    const row = this.getActiveRow();
    if (!row) return;

    this.db.prepare(
      'UPDATE alter_ego_week SET skipped = 1 WHERE id = ?'
    ).run(row.id);
  }

  /**
   * Replay the Alter Ego Week (reset to day 1).
   */
  replay(): AlterEgoWeekProgress {
    // Mark any existing as skipped/done
    const existing = this.getActiveRow();
    if (existing) {
      this.db.prepare('DELETE FROM alter_ego_week WHERE id = ?').run(existing.id);
    }

    return this.start();
  }

  /**
   * Check if the Alter Ego Week is currently active.
   */
  isActive(): boolean {
    const row = this.getActiveRow();
    return row !== null;
  }

  /**
   * Get current progress.
   */
  getProgress(): AlterEgoWeekProgress {
    const row = this.getActiveRow() ?? this.getLatestRow();
    if (!row) {
      return {
        isActive: false,
        currentDay: 0,
        completedDays: [],
        totalDays: 7,
        startedAt: null,
        completedAt: null,
        skipped: false,
      };
    }
    return this.rowToProgress(row);
  }

  /**
   * Get all day configs for display.
   */
  getAllDays(): DemonstrationConfig[] {
    return [...ALTER_EGO_WEEK_DAYS];
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private getActiveRow(): AlterEgoWeekRow | null {
    return (this.db.prepare(
      'SELECT * FROM alter_ego_week WHERE skipped = 0 AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1'
    ).get() as AlterEgoWeekRow | undefined) ?? null;
  }

  private getLatestRow(): AlterEgoWeekRow | null {
    return (this.db.prepare(
      'SELECT * FROM alter_ego_week ORDER BY started_at DESC LIMIT 1'
    ).get() as AlterEgoWeekRow | undefined) ?? null;
  }

  private getRow(id: string): AlterEgoWeekRow | null {
    return (this.db.prepare(
      'SELECT * FROM alter_ego_week WHERE id = ?'
    ).get(id) as AlterEgoWeekRow | undefined) ?? null;
  }

  private rowToProgress(row: AlterEgoWeekRow): AlterEgoWeekProgress {
    const completedDays = JSON.parse(row.completed_days) as number[];
    return {
      isActive: row.skipped === 0 && row.completed_at === null,
      currentDay: row.current_day,
      completedDays,
      totalDays: 7,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      skipped: row.skipped === 1,
    };
  }
}

interface AlterEgoWeekRow {
  id: string;
  started_at: string;
  current_day: number;
  completed_days: string;
  skipped: number;
  completed_at: string | null;
}

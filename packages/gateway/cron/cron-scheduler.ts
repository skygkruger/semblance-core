// CronScheduler — Proactive autonomous action triggers on user-defined schedules.
//
// Every triggered action flows through validateAndExecute() — no scheduled action
// bypasses the autonomy framework. At Partner tier, execute-risk scheduled actions
// surface for user approval via system.notification rather than executing silently.
//
// SQLite-backed schedule store in ~/.semblance/data/cron.db.
// Built-in jobs registered at first launch (all enabled, user can disable).
//
// CRITICAL: This file is in packages/gateway/. It may use network (via Gateway).

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';

export interface CronJob {
  id: string;
  name: string;
  /** Standard cron syntax: '0 7 * * *' */
  schedule: string;
  actionType: string;
  payload: Record<string, unknown>;
  autonomyDomain: string;
  enabled: boolean;
  lastFiredAt: string | null;
  nextFireAt: string;
  createdAt: string;
}

interface CronJobRow {
  id: string;
  name: string;
  schedule: string;
  action_type: string;
  payload_json: string;
  autonomy_domain: string;
  enabled: number;
  last_fired_at: string | null;
  next_fire_at: string;
  created_at: string;
}

/**
 * Built-in jobs registered at first launch.
 * All enabled by default. User can disable in Settings.
 */
const BUILT_IN_JOBS: Omit<CronJob, 'lastFiredAt' | 'nextFireAt' | 'createdAt'>[] = [
  {
    id: 'morning-brief',
    name: 'Morning Brief',
    schedule: '0 7 * * *',
    actionType: 'digest.generate',
    payload: {},
    autonomyDomain: 'digest',
    enabled: true,
  },
  {
    id: 'follow-up-scan',
    name: 'Follow-Up Scan',
    schedule: '0 9,17 * * *',
    actionType: 'email.scan_follow_ups',
    payload: {},
    autonomyDomain: 'email',
    enabled: true,
  },
  {
    id: 'subscription-audit',
    name: 'Subscription Audit',
    schedule: '0 10 1 * *',
    actionType: 'finance.audit_subscriptions',
    payload: {},
    autonomyDomain: 'finance',
    enabled: true,
  },
  {
    id: 'kg-maintenance',
    name: 'Knowledge Graph Maintenance',
    schedule: '0 2 * * 0',
    actionType: 'knowledge.maintenance',
    payload: {},
    autonomyDomain: 'knowledge',
    enabled: true,
  },
  {
    id: 'license-scan',
    name: 'License Scan',
    schedule: '0 8 * * *',
    actionType: 'license.scan_inbox',
    payload: {},
    autonomyDomain: 'system',
    enabled: true,
  },
  {
    id: 'tunnel-sync',
    name: 'Tunnel Knowledge Sync',
    schedule: '*/15 * * * *',
    actionType: 'network.sync_knowledge_delta',
    payload: {},
    autonomyDomain: 'network',
    enabled: true,
  },
];

/**
 * CronScheduler manages recurring scheduled jobs in the Semblance Gateway.
 * All jobs fire via the standard Gateway validateAndExecute() pipeline.
 */
export class CronScheduler {
  private db: Database.Database;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private onFireJob: ((job: CronJob) => Promise<void>) | null = null;

  constructor(dbOrPath?: Database.Database | string) {
    if (typeof dbOrPath === 'string' || dbOrPath === undefined) {
      const dbPath = dbOrPath ?? join(homedir(), '.semblance', 'data', 'cron.db');
      const dbDir = join(dbPath, '..');
      if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
      this.db = new Database(dbPath);
    } else {
      this.db = dbOrPath;
    }

    this.initSchema();
    this.seedBuiltInJobs();
  }

  /**
   * Set the callback that fires when a job is due.
   * The callback receives the CronJob and should route through validateAndExecute().
   */
  setFireHandler(handler: (job: CronJob) => Promise<void>): void {
    this.onFireJob = handler;
  }

  /**
   * Register a new job.
   */
  addJob(job: Omit<CronJob, 'lastFiredAt' | 'nextFireAt' | 'createdAt'>): CronJob {
    const now = new Date().toISOString();
    const nextFire = this.computeNextFire(job.schedule).toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO cron_jobs (id, name, schedule, action_type, payload_json, autonomy_domain, enabled, last_fired_at, next_fire_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(job.id, job.name, job.schedule, job.actionType, JSON.stringify(job.payload), job.autonomyDomain, job.enabled ? 1 : 0, nextFire, now);

    return { ...job, lastFiredAt: null, nextFireAt: nextFire, createdAt: now };
  }

  /**
   * Remove a job by ID.
   */
  removeJob(id: string): boolean {
    const result = this.db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * List all jobs with their current state.
   */
  listJobs(): CronJob[] {
    const rows = this.db.prepare('SELECT * FROM cron_jobs ORDER BY id').all() as CronJobRow[];
    return rows.map(this.rowToJob);
  }

  /**
   * Get a specific job by ID.
   */
  getJob(id: string): CronJob | null {
    const row = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id) as CronJobRow | undefined;
    return row ? this.rowToJob(row) : null;
  }

  /**
   * Enable a job by ID.
   */
  enableJob(id: string): boolean {
    const result = this.db.prepare('UPDATE cron_jobs SET enabled = 1 WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Disable a job by ID.
   */
  disableJob(id: string): boolean {
    const result = this.db.prepare('UPDATE cron_jobs SET enabled = 0 WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Update a job's cron schedule (e.g., customize morning brief time).
   */
  updateSchedule(id: string, schedule: string): boolean {
    const nextFire = this.computeNextFire(schedule).toISOString();
    const result = this.db.prepare(
      'UPDATE cron_jobs SET schedule = ?, next_fire_at = ? WHERE id = ?'
    ).run(schedule, nextFire, id);
    return result.changes > 0;
  }

  /**
   * Fire a job immediately (for testing or manual trigger).
   */
  async fireJob(id: string): Promise<{ success: boolean; message: string }> {
    const job = this.getJob(id);
    if (!job) return { success: false, message: `Job ${id} not found` };

    if (!this.onFireJob) {
      return { success: false, message: 'No fire handler registered' };
    }

    try {
      await this.onFireJob(job);
      this.markFired(id, job.schedule);
      return { success: true, message: `Job ${id} fired` };
    } catch (error) {
      return { success: false, message: `Job ${id} failed: ${(error as Error).message}` };
    }
  }

  /**
   * Called every 60 seconds by the daemon. Checks for due jobs and fires them.
   */
  async tick(): Promise<string[]> {
    const now = new Date();
    const firedIds: string[] = [];

    const dueJobs = this.db.prepare(
      'SELECT * FROM cron_jobs WHERE enabled = 1 AND next_fire_at <= ?'
    ).all(now.toISOString()) as CronJobRow[];

    for (const row of dueJobs) {
      const job = this.rowToJob(row);
      try {
        if (this.onFireJob) {
          await this.onFireJob(job);
        }
        this.markFired(job.id, job.schedule);
        firedIds.push(job.id);
      } catch (error) {
        console.error(`[CronScheduler] Job ${job.id} failed:`, (error as Error).message);
      }
    }

    return firedIds;
  }

  /**
   * Start the tick loop (every 60 seconds).
   * Also checks for missed jobs on startup (jobs that were due while daemon was stopped).
   */
  startTickLoop(): void {
    if (this.tickInterval) return; // already running

    // Fire missed jobs once on startup
    void this.tick();

    this.tickInterval = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  /**
   * Stop the tick loop.
   */
  stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /**
   * Close the database and stop the tick loop.
   */
  close(): void {
    this.stopTickLoop();
    this.db.close();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        action_type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        autonomy_domain TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_fired_at TEXT,
        next_fire_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  private seedBuiltInJobs(): void {
    const existing = this.db.prepare('SELECT id FROM cron_jobs').all() as { id: string }[];
    const existingIds = new Set(existing.map(r => r.id));

    for (const job of BUILT_IN_JOBS) {
      if (!existingIds.has(job.id)) {
        this.addJob(job);
      }
    }
  }

  private markFired(id: string, schedule: string): void {
    const now = new Date().toISOString();
    const nextFire = this.computeNextFire(schedule).toISOString();
    this.db.prepare(
      'UPDATE cron_jobs SET last_fired_at = ?, next_fire_at = ? WHERE id = ?'
    ).run(now, nextFire, id);
  }

  private rowToJob(row: CronJobRow): CronJob {
    return {
      id: row.id,
      name: row.name,
      schedule: row.schedule,
      actionType: row.action_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      autonomyDomain: row.autonomy_domain,
      enabled: row.enabled === 1,
      lastFiredAt: row.last_fired_at,
      nextFireAt: row.next_fire_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Compute next fire time from a cron expression.
   * Supports standard 5-field cron: minute hour day-of-month month day-of-week.
   * Pure implementation — no external cron library.
   */
  computeNextFire(schedule: string, from?: Date): Date {
    const now = from ?? new Date();
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
      // Invalid schedule — default to 1 hour from now
      return new Date(now.getTime() + 3600_000);
    }

    const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts as [string, string, string, string, string];

    // Try every minute for the next 366 days
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setMinutes(candidate.getMinutes() + 1);

    const maxAttempts = 366 * 24 * 60; // 1 year in minutes
    for (let i = 0; i < maxAttempts; i++) {
      if (
        this.matchesCronField(minExpr, candidate.getMinutes(), 0, 59) &&
        this.matchesCronField(hourExpr, candidate.getHours(), 0, 23) &&
        this.matchesCronField(domExpr, candidate.getDate(), 1, 31) &&
        this.matchesCronField(monExpr, candidate.getMonth() + 1, 1, 12) &&
        this.matchesCronField(dowExpr, candidate.getDay(), 0, 6)
      ) {
        return candidate;
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    // Fallback: 24 hours from now
    return new Date(now.getTime() + 86400_000);
  }

  // Match a single cron field (supports *, star-slash-N, N, comma-separated, and N-M ranges).
  private matchesCronField(expr: string, value: number, min: number, max: number): boolean {
    if (expr === '*') return true;

    // */N — step
    if (expr.startsWith('*/')) {
      const step = parseInt(expr.slice(2), 10);
      if (isNaN(step) || step <= 0) return false;
      return (value - min) % step === 0;
    }

    // Comma-separated values
    const parts = expr.split(',');
    for (const part of parts) {
      // Range: N-M
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = parseInt(startStr!, 10);
        const end = parseInt(endStr!, 10);
        if (!isNaN(start) && !isNaN(end) && value >= start && value <= end) {
          return true;
        }
      } else {
        // Single value
        const num = parseInt(part, 10);
        if (num === value) return true;
      }
    }

    return false;
  }
}

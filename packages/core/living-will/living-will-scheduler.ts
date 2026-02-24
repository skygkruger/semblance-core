// Living Will Scheduler — Automated periodic exports.
// CRITICAL: No networking imports. Entirely local.

import type { DatabaseHandle } from '../platform/types.js';
import type { LivingWillExporter } from './living-will-exporter.js';
import type { SchedulerConfig, SchedulerRunResult } from './types.js';

const MS_PER_DAY = 86_400_000;
const WEEKLY_MS = 7 * MS_PER_DAY;
const MONTHLY_MS = 30 * MS_PER_DAY;

export interface LivingWillSchedulerDeps {
  db: DatabaseHandle;
  exporter: LivingWillExporter;
  getPassphrase: () => Promise<string | null>;
  outputPath: string;
}

/**
 * Manages scheduled Living Will exports on a configurable cadence.
 */
export class LivingWillScheduler {
  private db: DatabaseHandle;
  private exporter: LivingWillExporter;
  private getPassphrase: () => Promise<string | null>;
  private outputPath: string;

  constructor(deps: LivingWillSchedulerDeps) {
    this.db = deps.db;
    this.exporter = deps.exporter;
    this.getPassphrase = deps.getPassphrase;
    this.outputPath = deps.outputPath;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS living_will_schedule (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cadence TEXT NOT NULL DEFAULT 'disabled',
        output_path TEXT NOT NULL,
        last_run_at TEXT,
        next_run_at TEXT
      )
    `);
  }

  /**
   * Set the export cadence.
   */
  configure(cadence: 'weekly' | 'monthly' | 'disabled'): void {
    const now = new Date().toISOString();
    const nextRun = cadence === 'disabled' ? null : this.computeNextRun(cadence, now);

    this.db.prepare(`
      INSERT INTO living_will_schedule (id, cadence, output_path, last_run_at, next_run_at)
      VALUES (1, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        cadence = excluded.cadence,
        output_path = excluded.output_path,
        next_run_at = excluded.next_run_at
    `).run(cadence, this.outputPath, nextRun);
  }

  /**
   * Get current scheduler configuration.
   */
  getConfig(): SchedulerConfig {
    const row = this.db.prepare(
      'SELECT cadence, output_path, last_run_at, next_run_at FROM living_will_schedule WHERE id = 1',
    ).get() as { cadence: string; output_path: string; last_run_at: string | null; next_run_at: string | null } | undefined;

    if (!row) {
      return {
        cadence: 'disabled',
        outputPath: this.outputPath,
        lastRunAt: null,
        nextRunAt: null,
      };
    }

    return {
      cadence: row.cadence as SchedulerConfig['cadence'],
      outputPath: row.output_path,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
    };
  }

  /**
   * Check if an export is due based on cadence and last run time.
   */
  isDue(): boolean {
    const config = this.getConfig();
    if (config.cadence === 'disabled') return false;

    if (!config.lastRunAt) return true;

    const elapsed = Date.now() - new Date(config.lastRunAt).getTime();
    const interval = config.cadence === 'weekly' ? WEEKLY_MS : MONTHLY_MS;
    return elapsed >= interval;
  }

  /**
   * Check if due and run export if so.
   */
  async checkAndRun(): Promise<SchedulerRunResult> {
    if (!this.isDue()) {
      return { ran: false, skipped: false };
    }

    const passphrase = await this.getPassphrase();
    if (!passphrase) {
      return { ran: false, skipped: true, reason: 'passphrase_unavailable' };
    }

    const config = this.getConfig();
    const exportResult = await this.exporter.export({}, passphrase, config.outputPath);

    if (exportResult.success) {
      const now = new Date().toISOString();
      const nextRun = this.computeNextRun(config.cadence, now);
      this.db.prepare(
        'UPDATE living_will_schedule SET last_run_at = ?, next_run_at = ? WHERE id = 1',
      ).run(now, nextRun);
    }

    return { ran: true, skipped: false, exportResult };
  }

  private computeNextRun(cadence: string, fromIso: string): string {
    const from = new Date(fromIso).getTime();
    const interval = cadence === 'weekly' ? WEEKLY_MS : MONTHLY_MS;
    return new Date(from + interval).toISOString();
  }
}

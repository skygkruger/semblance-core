// Morning Brief Scheduler — Manages delivery timing and preferences.
//
// Configurable delivery time (default 07:00). Stores preferences in
// SQLite preferences table. Fires callback when brief is ready.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { MorningBriefGenerator, MorningBrief, MorningBriefPreferences } from './morning-brief.js';

export class MorningBriefScheduler {
  private db: DatabaseHandle;
  private generator: MorningBriefGenerator;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onBriefReady?: (brief: MorningBrief) => void;
  private onPreferenceChanged?: (prefs: MorningBriefPreferences) => void;

  constructor(config: {
    db: DatabaseHandle;
    generator: MorningBriefGenerator;
    onBriefReady?: (brief: MorningBrief) => void;
    onPreferenceChanged?: (prefs: MorningBriefPreferences) => void;
  }) {
    this.db = config.db;
    this.generator = config.generator;
    this.onBriefReady = config.onBriefReady;
    this.onPreferenceChanged = config.onPreferenceChanged;

    // Ensure preferences table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  /**
   * Get morning brief preferences.
   */
  getPreferences(): MorningBriefPreferences {
    try {
      const row = this.db.prepare(
        "SELECT value FROM preferences WHERE key = 'morning_brief_prefs'"
      ).get() as { value: string } | undefined;

      if (row) {
        return JSON.parse(row.value) as MorningBriefPreferences;
      }
    } catch {
      // Table may not exist yet
    }
    return { enabled: true, time: '07:00' };
  }

  /**
   * Set morning brief preferences.
   */
  setPreferences(prefs: MorningBriefPreferences): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO preferences (key, value) VALUES ('morning_brief_prefs', ?)`
    ).run(JSON.stringify(prefs));

    this.onPreferenceChanged?.(prefs);

    // Reschedule if running
    if (this.timer) {
      this.cancel();
      if (prefs.enabled) this.schedule();
    }
  }

  /**
   * Get the next scheduled delivery time based on preferences.
   */
  getNextDeliveryTime(): Date | null {
    const prefs = this.getPreferences();
    if (!prefs.enabled) return null;

    const [hours, minutes] = prefs.time.split(':').map(Number);
    const now = new Date();
    const next = new Date(now);
    next.setHours(hours!, minutes!, 0, 0);

    // If that time has already passed today, schedule for tomorrow
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Schedule the next brief delivery.
   */
  schedule(): void {
    const prefs = this.getPreferences();
    if (!prefs.enabled) return;

    const nextDelivery = this.getNextDeliveryTime();
    if (!nextDelivery) return;

    const delayMs = nextDelivery.getTime() - Date.now();
    this.timer = setTimeout(async () => {
      await this.deliver();
      // Re-schedule for next day
      this.schedule();
    }, delayMs);
  }

  /**
   * Cancel the scheduled delivery.
   */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Trigger immediate brief generation and delivery.
   */
  async triggerNow(): Promise<MorningBrief> {
    const brief = await this.generator.generateBrief();
    this.onBriefReady?.(brief);
    return brief;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private async deliver(): Promise<void> {
    try {
      const brief = await this.generator.generateBrief();
      this.onBriefReady?.(brief);
    } catch {
      // Delivery failed — will retry on next schedule
    }
  }
}

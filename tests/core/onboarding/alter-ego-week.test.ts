// Alter Ego Week State Machine Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AlterEgoWeek } from '../../../packages/core/onboarding/alter-ego-week.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

function wrapDatabase(dbPath: string): DatabaseHandle {
  const db = new Database(dbPath);
  return {
    pragma: (s: string) => db.pragma(s),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
        run: (...params: unknown[]) => stmt.run(...params),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return db.transaction(fn as Parameters<typeof db.transaction>[0]) as unknown as T;
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

describe('AlterEgoWeek', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-aew-'));
    db = wrapDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('start() creates week at day 1', () => {
    const week = new AlterEgoWeek({ db });
    const progress = week.start();

    expect(progress.isActive).toBe(true);
    expect(progress.currentDay).toBe(1);
    expect(progress.completedDays).toEqual([]);
    expect(progress.startedAt).toBeTruthy();
  });

  it('getCurrentDay() returns correct theme/domain', () => {
    const week = new AlterEgoWeek({ db });
    week.start();

    const day = week.getCurrentDay();
    expect(day).not.toBeNull();
    expect(day!.day).toBe(1);
    expect(day!.theme).toBe('Email Intelligence');
    expect(day!.domain).toBe('email');
    expect(day!.type).toBe('email_triage');
  });

  it('completeDay(1) advances to day 2', () => {
    const week = new AlterEgoWeek({ db });
    week.start();

    const progress = week.completeDay(1);
    expect(progress).not.toBeNull();
    expect(progress!.currentDay).toBe(2);
    expect(progress!.completedDays).toContain(1);
    expect(progress!.isActive).toBe(true);

    // getCurrentDay should now be day 2
    const day = week.getCurrentDay();
    expect(day!.day).toBe(2);
    expect(day!.theme).toBe('Calendar Mastery');
  });

  it('all 7 days complete marks week completed', () => {
    const week = new AlterEgoWeek({ db });
    week.start();

    for (let i = 1; i <= 7; i++) {
      week.completeDay(i);
    }

    const progress = week.getProgress();
    expect(progress.completedDays.length).toBe(7);
    expect(progress.completedAt).toBeTruthy();
    expect(progress.isActive).toBe(false);
  });

  it('skip() marks inactive', () => {
    const week = new AlterEgoWeek({ db });
    week.start();
    expect(week.isActive()).toBe(true);

    week.skip();
    expect(week.isActive()).toBe(false);

    const progress = week.getProgress();
    expect(progress.isActive).toBe(false);
    expect(progress.skipped).toBe(true);
  });

  it('replay() resets to day 1', () => {
    const week = new AlterEgoWeek({ db });
    week.start();
    week.completeDay(1);
    week.completeDay(2);

    const progress = week.replay();
    expect(progress.currentDay).toBe(1);
    expect(progress.completedDays).toEqual([]);
    expect(progress.isActive).toBe(true);
  });

  it('isActive() false after skip/complete', () => {
    const week = new AlterEgoWeek({ db });

    // Not started
    expect(week.isActive()).toBe(false);

    // Started
    week.start();
    expect(week.isActive()).toBe(true);

    // Skipped
    week.skip();
    expect(week.isActive()).toBe(false);
  });

  it('getProgress() returns correct state', () => {
    const week = new AlterEgoWeek({ db });

    // Not started
    let progress = week.getProgress();
    expect(progress.isActive).toBe(false);
    expect(progress.currentDay).toBe(0);

    // Started
    week.start();
    progress = week.getProgress();
    expect(progress.isActive).toBe(true);
    expect(progress.currentDay).toBe(1);
    expect(progress.totalDays).toBe(7);
  });

  it('double-start is idempotent', () => {
    const week = new AlterEgoWeek({ db });
    const first = week.start();
    const second = week.start();

    // Both should return same state
    expect(first.currentDay).toBe(second.currentDay);
    expect(first.startedAt).toBe(second.startedAt);
  });

  it('each day has correct DemonstrationConfig', () => {
    const week = new AlterEgoWeek({ db });
    const days = week.getAllDays();

    expect(days.length).toBe(7);
    expect(days[0]!.theme).toBe('Email Intelligence');
    expect(days[1]!.theme).toBe('Calendar Mastery');
    expect(days[2]!.theme).toBe('Financial Awareness');
    expect(days[3]!.theme).toBe('Your Voice');
    expect(days[4]!.theme).toBe('Research Assistant');
    expect(days[5]!.theme).toBe('Multi-Domain');
    expect(days[6]!.theme).toBe('The Offer');

    // Domains
    expect(days[0]!.domain).toBe('email');
    expect(days[1]!.domain).toBe('calendar');
    expect(days[2]!.domain).toBe('finances');
    expect(days[3]!.domain).toBe('email');
    expect(days[4]!.domain).toBe('web');
    expect(days[5]!.domain).toBe('system');
    expect(days[6]!.domain).toBe('system');

    // Types
    expect(days[0]!.type).toBe('email_triage');
    expect(days[6]!.type).toBe('activation_offer');
  });
});

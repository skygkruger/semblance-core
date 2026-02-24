// Morning Brief Scheduler Tests — Validates scheduling, preferences, and delivery.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MorningBriefScheduler } from '../../../packages/core/agent/morning-brief-scheduler.js';
import type { MorningBriefGenerator, MorningBrief } from '../../../packages/core/agent/morning-brief.js';
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

function createMockGenerator(): MorningBriefGenerator {
  const mockBrief: MorningBrief = {
    id: 'brief-1',
    date: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    sections: [],
    summary: 'Good morning. Nothing notable today.',
    estimatedReadTimeSeconds: 10,
    dismissed: false,
  };

  return {
    generateBrief: vi.fn(async () => mockBrief),
    getByDate: vi.fn(),
    dismiss: vi.fn(),
  } as unknown as MorningBriefGenerator;
}

describe('MorningBriefScheduler', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-sched-'));
    db = wrapDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('stores and retrieves preferences', () => {
    const scheduler = new MorningBriefScheduler({ db, generator: createMockGenerator() });

    scheduler.setPreferences({ enabled: false, time: '09:30' });
    const prefs = scheduler.getPreferences();
    expect(prefs.enabled).toBe(false);
    expect(prefs.time).toBe('09:30');
  });

  it('getNextDeliveryTime correct based on current time', () => {
    const scheduler = new MorningBriefScheduler({ db, generator: createMockGenerator() });
    scheduler.setPreferences({ enabled: true, time: '07:00' });

    const next = scheduler.getNextDeliveryTime();
    expect(next).not.toBeNull();
    expect(next!.getHours()).toBe(7);
    expect(next!.getMinutes()).toBe(0);
    // Should be in the future
    expect(next!.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('triggerNow generates brief and fires callback', async () => {
    const callback = vi.fn();
    const generator = createMockGenerator();
    const scheduler = new MorningBriefScheduler({
      db,
      generator,
      onBriefReady: callback,
    });

    const brief = await scheduler.triggerNow();
    expect(brief.id).toBe('brief-1');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'brief-1' }));
    expect(generator.generateBrief).toHaveBeenCalledTimes(1);
  });

  it('respects enabled=false', () => {
    const scheduler = new MorningBriefScheduler({ db, generator: createMockGenerator() });
    scheduler.setPreferences({ enabled: false, time: '07:00' });

    const next = scheduler.getNextDeliveryTime();
    expect(next).toBeNull();
  });

  it('preference change fires onPreferenceChanged', () => {
    const callback = vi.fn();
    const scheduler = new MorningBriefScheduler({
      db,
      generator: createMockGenerator(),
      onPreferenceChanged: callback,
    });

    scheduler.setPreferences({ enabled: true, time: '06:30' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ enabled: true, time: '06:30' });
  });

  it('default preferences are enabled at 07:00', () => {
    const scheduler = new MorningBriefScheduler({ db, generator: createMockGenerator() });
    const prefs = scheduler.getPreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.time).toBe('07:00');
  });
});

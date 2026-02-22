// Daily Digest Generator Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DailyDigestGenerator } from '../../../packages/core/agent/daily-digest.js';
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

describe('DailyDigestGenerator', () => {
  let db: DatabaseHandle;
  let generator: DailyDigestGenerator;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-digest-'));
    db = wrapDatabase(join(tempDir, 'test.db'));

    // Create an audit_trail table for testing
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_hash TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'success',
        autonomy_tier TEXT NOT NULL DEFAULT 'partner',
        approval_required INTEGER NOT NULL DEFAULT 0,
        approval_given INTEGER,
        estimated_time_saved_seconds INTEGER NOT NULL DEFAULT 0,
        response_hash TEXT,
        chain_hash TEXT NOT NULL DEFAULT ''
      )
    `);

    generator = new DailyDigestGenerator(db);
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('should aggregate action counts correctly', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ts = `${today}T10:00:00`;

    // Insert test audit trail entries
    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a1', 'r1', ts, 'email.send', 60);
    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a2', 'r2', ts, 'email.archive', 30);
    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a3', 'r3', ts, 'calendar.create', 120);

    const digest = generator.generate();
    expect(digest.totalActions).toBe(3);
    expect(digest.emailsHandled).toBe(2);
    expect(digest.meetingsPrepped).toBe(1);
  });

  it('should sum time saved correctly', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ts = `${today}T10:00:00`;

    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a1', 'r1', ts, 'email.send', 120);
    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a2', 'r2', ts, 'web.search', 60);

    const digest = generator.generate();
    expect(digest.totalTimeSavedSeconds).toBe(180);
    expect(digest.timeSavedFormatted).toBe('3 min');
  });

  it('empty day → zero actions (not error)', () => {
    const digest = generator.generate();
    expect(digest.totalActions).toBe(0);
    expect(digest.emailsHandled).toBe(0);
    expect(digest.summary).toBe('No actions today.');
  });

  it('dismiss sets flag', () => {
    const digest = generator.generate();
    expect(digest.dismissed).toBe(false);

    generator.dismiss(digest.id);
    const updated = generator.getToday();
    expect(updated?.dismissed).toBe(true);
  });

  it('getToday returns null then digest after generate', () => {
    expect(generator.getToday()).toBeNull();
    generator.generate();
    expect(generator.getToday()).not.toBeNull();
  });

  it('idempotent generation (same digest returned)', () => {
    const d1 = generator.generate();
    const d2 = generator.generate();
    expect(d1.id).toBe(d2.id);
    expect(d1.totalActions).toBe(d2.totalActions);
  });

  it('date boundary correctness', () => {
    // Insert action from yesterday
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    const yesterdayTs = `${yesterday}T23:59:59`;
    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('ay1', 'ry1', yesterdayTs, 'email.send', 60);

    // Today's digest should NOT include yesterday's actions
    const digest = generator.generate();
    expect(digest.totalActions).toBe(0);
  });

  it('summary template formatting', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ts = `${today}T10:00:00`;

    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a1', 'r1', ts, 'email.send', 120);
    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds)
       VALUES (?, ?, ?, ?, 'success', ?)`
    ).run('a2', 'r2', ts, 'reminder.create', 30);

    const digest = generator.generate();
    expect(digest.summary).toContain('1 emails handled');
    expect(digest.summary).toContain('1 reminders created');
    expect(digest.summary).toContain('Time saved');
  });

  it('preferences default correctly', () => {
    const prefs = generator.getPreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.time).toBe('08:00');
  });

  it('preferences persist after set', () => {
    generator.setPreferences({ enabled: false, time: '09:30' });
    const prefs = generator.getPreferences();
    expect(prefs.enabled).toBe(false);
    expect(prefs.time).toBe('09:30');
  });

  it('setPreferences triggers onPreferenceChanged callback', () => {
    const callback = vi.fn();
    const gen = new DailyDigestGenerator(db, { onPreferenceChanged: callback });

    gen.setPreferences({ enabled: false, time: '20:00' });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ enabled: false, time: '20:00' });
  });

  it('setPreferences works without callback configured', () => {
    const gen = new DailyDigestGenerator(db);

    // Should not throw
    gen.setPreferences({ enabled: true, time: '07:00' });
    expect(gen.getPreferences().time).toBe('07:00');
  });
});

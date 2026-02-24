// Alter Ego Activation Tests — Day 7 activation prompt and domain upgrade.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AlterEgoActivation } from '../../../packages/core/onboarding/alter-ego-activation.js';
import { AutonomyManager } from '../../../packages/core/agent/autonomy.js';
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

function seedAuditTrail(db: DatabaseHandle, entries: Array<{
  action: string;
  status?: string;
  timeSaved?: number;
  daysAgo?: number;
}>) {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const timestamp = new Date(
      Date.now() - (entry.daysAgo ?? 0) * 24 * 60 * 60 * 1000
    ).toISOString();

    db.prepare(
      `INSERT INTO audit_trail (id, request_id, timestamp, action, status, estimated_time_saved_seconds, chain_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `entry-${i}`,
      `req-${i}`,
      timestamp,
      entry.action,
      entry.status ?? 'success',
      entry.timeSaved ?? 30,
      `hash-${i}`,
    );
  }
}

describe('AlterEgoActivation', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-activation-'));
    db = wrapDatabase(join(tempDir, 'test.db'));

    // Create audit_trail table
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
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('prompt has correct totalActions from audit trail', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: {},
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    seedAuditTrail(db, [
      { action: 'email.archive', daysAgo: 1 },
      { action: 'email.draft', daysAgo: 2 },
      { action: 'calendar.update', daysAgo: 3 },
      { action: 'email.markRead', daysAgo: 4 },
      { action: 'web.search', daysAgo: 5 },
    ]);

    const prompt = activation.generateActivationPrompt();
    expect(prompt.totalActions).toBe(5);
  });

  it('success rate computed accurately', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: {},
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    seedAuditTrail(db, [
      { action: 'email.archive', status: 'success', daysAgo: 1 },
      { action: 'email.draft', status: 'success', daysAgo: 1 },
      { action: 'email.send', status: 'success', daysAgo: 2 },
      { action: 'calendar.update', status: 'error', daysAgo: 2 },
    ]);

    const prompt = activation.generateActivationPrompt();
    expect(prompt.successRate).toBe(75); // 3 of 4
  });

  it('domainsCovered lists distinct domains from audit trail', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: {},
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    seedAuditTrail(db, [
      { action: 'email.archive', daysAgo: 1 },
      { action: 'email.draft', daysAgo: 2 },
      { action: 'calendar.update', daysAgo: 3 },
      { action: 'web.search', daysAgo: 4 },
      { action: 'web.fetch', daysAgo: 5 },
    ]);

    const prompt = activation.generateActivationPrompt();
    expect(prompt.domainsCovered).toContain('email');
    expect(prompt.domainsCovered).toContain('calendar');
    expect(prompt.domainsCovered).toContain('web');
    expect(prompt.domainsCovered.length).toBe(3);
  });

  it('activate() calls autonomyManager.setDomainTier for specified domains', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: { email: 'partner', calendar: 'partner' },
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    activation.activate(['email', 'calendar']);

    expect(autonomy.getDomainTier('email')).toBe('alter_ego');
    expect(autonomy.getDomainTier('calendar')).toBe('alter_ego');
    // Web was not specified, should remain partner
    expect(autonomy.getDomainTier('web')).toBe('partner');
  });

  it('activate() with no args upgrades all domains', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: {},
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    activation.activate();

    expect(autonomy.getDomainTier('email')).toBe('alter_ego');
    expect(autonomy.getDomainTier('calendar')).toBe('alter_ego');
    expect(autonomy.getDomainTier('finances')).toBe('alter_ego');
    expect(autonomy.getDomainTier('web')).toBe('alter_ego');
    expect(autonomy.getDomainTier('reminders')).toBe('alter_ego');
  });

  it('safeguards array is non-empty', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: {},
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    const prompt = activation.generateActivationPrompt();
    expect(prompt.safeguards.length).toBeGreaterThan(0);
    expect(prompt.safeguards.every(s => typeof s === 'string')).toBe(true);
  });

  it('differences include email + calendar + web minimum', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: { email: 'partner', calendar: 'partner', web: 'partner' },
    });
    const activation = new AlterEgoActivation({ db, autonomy });

    // Even with no audit trail data, core domains should appear
    const prompt = activation.generateActivationPrompt();
    const domains = prompt.differences.map(d => d.domain);
    expect(domains).toContain('email');
    expect(domains).toContain('calendar');
    expect(domains).toContain('web');
  });
});

// Alter Ego Verification Tests — Autonomy behavior matrix across all three tiers.
//
// Validates: for each domain × action × tier, the correct decision is returned.
// Documents email.send in Alter Ego requiring approval as intentional current behavior.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AutonomyManager } from '../../../packages/core/agent/autonomy.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import type { AutonomyDomain } from '../../../packages/core/agent/types.js';

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

describe('Alter Ego Verification — Autonomy Behavior Matrix', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-aev-'));
    db = wrapDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  function createManager(domain: AutonomyDomain, tier: 'guardian' | 'partner' | 'alter_ego') {
    return new AutonomyManager(db, {
      defaultTier: tier,
      domainOverrides: { [domain]: tier },
    });
  }

  // ─── Email Domain ─────────────────────────────────────────────────────

  describe('Email triage: markRead', () => {
    it('Guardian: requires_approval', () => {
      const mgr = createManager('email', 'guardian');
      expect(mgr.decide('email.markRead')).toBe('requires_approval');
    });

    it('Partner: auto_approve (write action)', () => {
      const mgr = createManager('email', 'partner');
      expect(mgr.decide('email.markRead')).toBe('auto_approve');
    });

    it('Alter Ego: auto_approve', () => {
      const mgr = createManager('email', 'alter_ego');
      expect(mgr.decide('email.markRead')).toBe('auto_approve');
    });
  });

  describe('Email drafting: draft', () => {
    it('Guardian: requires_approval', () => {
      const mgr = createManager('email', 'guardian');
      expect(mgr.decide('email.draft')).toBe('requires_approval');
    });

    it('Partner: auto_approve (write action)', () => {
      const mgr = createManager('email', 'partner');
      expect(mgr.decide('email.draft')).toBe('auto_approve');
    });

    it('Alter Ego: auto_approve', () => {
      const mgr = createManager('email', 'alter_ego');
      expect(mgr.decide('email.draft')).toBe('auto_approve');
    });
  });

  describe('Email sending: send', () => {
    it('Guardian: requires_approval', () => {
      const mgr = createManager('email', 'guardian');
      expect(mgr.decide('email.send')).toBe('requires_approval');
    });

    it('Partner: requires_approval (execute action)', () => {
      const mgr = createManager('email', 'partner');
      expect(mgr.decide('email.send')).toBe('requires_approval');
    });

    // INTENTIONAL: email.send still requires approval even in Alter Ego.
    // This is documented at autonomy.ts:184 and is current-correct behavior.
    it('Alter Ego: requires_approval (intentional — email sends always need approval)', () => {
      const mgr = createManager('email', 'alter_ego');
      expect(mgr.decide('email.send')).toBe('requires_approval');
    });
  });

  // ─── Calendar Domain ──────────────────────────────────────────────────

  describe('Calendar resolution: update', () => {
    it('Guardian: requires_approval', () => {
      const mgr = createManager('calendar', 'guardian');
      expect(mgr.decide('calendar.update')).toBe('requires_approval');
    });

    it('Partner: auto_approve (write action)', () => {
      const mgr = createManager('calendar', 'partner');
      expect(mgr.decide('calendar.update')).toBe('auto_approve');
    });

    it('Alter Ego: auto_approve', () => {
      const mgr = createManager('calendar', 'alter_ego');
      expect(mgr.decide('calendar.update')).toBe('auto_approve');
    });
  });

  // ─── Finance Domain ───────────────────────────────────────────────────

  describe('Subscription detection: fetch_transactions', () => {
    it('all tiers auto_approve (read action)', () => {
      for (const tier of ['guardian', 'partner', 'alter_ego'] as const) {
        // Note: guardian requires approval for ALL actions including reads
        const mgr = createManager('finances', tier);
        const decision = mgr.decide('finance.fetch_transactions');
        if (tier === 'guardian') {
          expect(decision).toBe('requires_approval');
        } else {
          expect(decision).toBe('auto_approve');
        }
      }
    });
  });

  // ─── Reminders Domain ─────────────────────────────────────────────────

  describe('Reminders: create', () => {
    it('Guardian: requires_approval', () => {
      const mgr = createManager('reminders', 'guardian');
      expect(mgr.decide('reminder.create')).toBe('requires_approval');
    });

    it('Partner: auto_approve (write action)', () => {
      const mgr = createManager('reminders', 'partner');
      expect(mgr.decide('reminder.create')).toBe('auto_approve');
    });

    it('Alter Ego: auto_approve', () => {
      const mgr = createManager('reminders', 'alter_ego');
      expect(mgr.decide('reminder.create')).toBe('auto_approve');
    });
  });

  // ─── Web Domain ───────────────────────────────────────────────────────

  describe('Web search: search', () => {
    it('all tiers auto_approve except guardian (read action)', () => {
      const guardianMgr = createManager('web', 'guardian');
      expect(guardianMgr.decide('web.search')).toBe('requires_approval');

      const partnerMgr = createManager('web', 'partner');
      expect(partnerMgr.decide('web.search')).toBe('auto_approve');

      const aeManager = createManager('web', 'alter_ego');
      expect(aeManager.decide('web.search')).toBe('auto_approve');
    });
  });
});

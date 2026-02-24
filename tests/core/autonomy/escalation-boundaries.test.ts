// Escalation Boundaries Tests — Validates BoundaryEnforcer checks.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BoundaryEnforcer } from '../../../packages/core/agent/escalation-boundaries.js';
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

describe('BoundaryEnforcer', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-boundary-'));
    db = wrapDatabase(join(tempDir, 'test.db'));

    // Create approval_patterns table for novel action checks
    db.exec(`
      CREATE TABLE IF NOT EXISTS approval_patterns (
        action_type TEXT NOT NULL,
        sub_type TEXT NOT NULL,
        consecutive_approvals INTEGER NOT NULL DEFAULT 0,
        total_approvals INTEGER NOT NULL DEFAULT 0,
        total_rejections INTEGER NOT NULL DEFAULT 0,
        last_approval_at TEXT,
        last_rejection_at TEXT,
        auto_execute_threshold INTEGER NOT NULL DEFAULT 3,
        PRIMARY KEY (action_type, sub_type)
      )
    `);
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('amount > threshold triggers financial escalation', () => {
    const enforcer = new BoundaryEnforcer(db, { financialThreshold: 500 });
    const boundaries = enforcer.checkBoundaries({
      action: 'email.send',
      payload: { amount: 2000 },
    });

    expect(boundaries.some(b => b.type === 'financial_threshold')).toBe(true);
    expect(enforcer.shouldEscalate(boundaries)).toBe(true);
  });

  it('"This contract is binding" triggers legal escalation', () => {
    const enforcer = new BoundaryEnforcer(db);
    const boundaries = enforcer.checkBoundaries({
      action: 'email.send',
      payload: { body: 'This contract is binding and effective immediately.' },
    });

    expect(boundaries.some(b => b.type === 'legal_language')).toBe(true);
  });

  it('novel action type (zero history) triggers escalation', () => {
    const enforcer = new BoundaryEnforcer(db);
    // No entries in approval_patterns for this action
    const boundaries = enforcer.checkBoundaries({
      action: 'service.api_call',
      payload: {},
    });

    expect(boundaries.some(b => b.type === 'novel')).toBe(true);
  });

  it('low confidence triggers escalation', () => {
    const enforcer = new BoundaryEnforcer(db, { confidenceThreshold: 0.7 });
    const boundaries = enforcer.checkBoundaries({
      action: 'email.draft',
      payload: {},
      llmConfidence: 0.3,
    });

    expect(boundaries.some(b => b.type === 'low_confidence')).toBe(true);
    expect(enforcer.shouldEscalate(boundaries)).toBe(true);
  });

  it('normal action, good confidence, known type → no escalation', () => {
    const enforcer = new BoundaryEnforcer(db);

    // Add prior approval so it's not novel
    db.prepare(
      `INSERT INTO approval_patterns (action_type, sub_type, total_approvals, consecutive_approvals)
       VALUES (?, ?, ?, ?)`
    ).run('email.draft', 'new_draft', 5, 5);

    const boundaries = enforcer.checkBoundaries({
      action: 'email.draft',
      payload: { body: 'Hey, just checking in.' },
      llmConfidence: 0.9,
    });

    expect(boundaries.length).toBe(0);
    expect(enforcer.shouldEscalate(boundaries)).toBe(false);
  });

  it('multiple boundaries trigger simultaneously', () => {
    const enforcer = new BoundaryEnforcer(db, { financialThreshold: 500 });
    const boundaries = enforcer.checkBoundaries({
      action: 'service.api_call', // novel (no patterns)
      payload: {
        amount: 1000, // financial
        body: 'This agreement is binding', // legal
      },
      llmConfidence: 0.4, // low confidence
    });

    const types = boundaries.map(b => b.type);
    expect(types).toContain('financial_threshold');
    expect(types).toContain('legal_language');
    expect(types).toContain('novel');
    expect(types).toContain('low_confidence');
    expect(boundaries.length).toBeGreaterThanOrEqual(4);
  });
});

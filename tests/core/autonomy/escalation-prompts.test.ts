// Escalation Prompts Tests — Validates tier upgrade prompts and cooldowns.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EscalationEngine } from '../../../packages/core/agent/autonomy-escalation.js';
import { AutonomyManager } from '../../../packages/core/agent/autonomy.js';
import type { ApprovalPattern } from '../../../packages/core/agent/approval-patterns.js';
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

function makePattern(overrides: Partial<ApprovalPattern>): ApprovalPattern {
  return {
    actionType: 'email.archive',
    subType: 'archive',
    consecutiveApprovals: 0,
    totalApprovals: 0,
    totalRejections: 0,
    lastApprovalAt: null,
    lastRejectionAt: null,
    autoExecuteThreshold: 3,
    ...overrides,
  };
}

describe('Escalation Prompts', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-esc-'));
    db = wrapDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('10 consecutive approvals in Guardian generates guardian_to_partner prompt', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'guardian',
      domainOverrides: { email: 'guardian' },
    });
    const engine = new EscalationEngine({ db, autonomy, aiName: 'Semblance' });

    const pattern = makePattern({
      actionType: 'email.archive',
      subType: 'archive',
      consecutiveApprovals: 10,
      totalApprovals: 10,
      lastApprovalAt: new Date().toISOString(),
    });

    const prompts = engine.checkForEscalations([pattern]);
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts[0]!.type).toBe('guardian_to_partner');
    expect(prompts[0]!.domain).toBe('email');
  });

  it('Partner with 14+ approvals, 0 rejections, 5+ consecutive generates partner_to_alterego', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'partner',
      domainOverrides: { email: 'partner' },
    });
    const engine = new EscalationEngine({ db, autonomy, aiName: 'Semblance' });

    const pattern = makePattern({
      actionType: 'email.archive',
      subType: 'archive',
      consecutiveApprovals: 6,
      totalApprovals: 15,
      totalRejections: 0,
      lastApprovalAt: new Date().toISOString(),
    });

    const prompts = engine.checkForEscalations([pattern]);
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts[0]!.type).toBe('partner_to_alterego');
  });

  it('dismissed prompt has 7-day cooldown (G→P) / 14-day cooldown (P→AE)', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'guardian',
      domainOverrides: { email: 'guardian' },
    });
    const engine = new EscalationEngine({ db, autonomy });

    // Generate a prompt
    const pattern = makePattern({
      actionType: 'email.archive',
      subType: 'archive',
      consecutiveApprovals: 12,
      totalApprovals: 12,
      lastApprovalAt: new Date().toISOString(),
    });

    const prompts = engine.checkForEscalations([pattern]);
    expect(prompts.length).toBe(1);

    // Dismiss it
    engine.recordResponse(prompts[0]!.id, false);

    // Immediately check again — should NOT generate new prompt (cooldown)
    const secondCheck = engine.checkForEscalations([pattern]);
    expect(secondCheck.length).toBe(0);
  });

  it('accepted prompt calls autonomyManager.setDomainTier', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'guardian',
      domainOverrides: { email: 'guardian' },
    });
    const engine = new EscalationEngine({ db, autonomy });

    const pattern = makePattern({
      actionType: 'email.archive',
      subType: 'archive',
      consecutiveApprovals: 10,
      totalApprovals: 10,
      lastApprovalAt: new Date().toISOString(),
    });

    const prompts = engine.checkForEscalations([pattern]);
    engine.recordResponse(prompts[0]!.id, true);

    // Tier should now be 'partner'
    expect(autonomy.getDomainTier('email')).toBe('partner');
  });

  it('expired prompts get status expired', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'guardian',
      domainOverrides: { email: 'guardian' },
    });
    const engine = new EscalationEngine({ db, autonomy });

    // Create a prompt with an already-expired date by manipulating DB directly
    const now = new Date();
    const pastExpiry = new Date(now.getTime() - 86400_000).toISOString(); // expired yesterday

    db.prepare(`
      INSERT INTO escalation_prompts (id, type, domain, action_type, consecutive_approvals, message, preview_actions, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('test-expired', 'guardian_to_partner', 'email', 'email.archive', 10, 'Test', '[]', now.toISOString(), pastExpiry, 'pending');

    // Getting active prompts should expire this
    const active = engine.getActivePrompts();
    expect(active.length).toBe(0);

    // Check its status
    const prompt = engine.getPrompt('test-expired');
    expect(prompt?.status).toBe('expired');
  });

  it('prompt message includes AI name and contextual description', () => {
    const autonomy = new AutonomyManager(db, {
      defaultTier: 'guardian',
      domainOverrides: { email: 'guardian' },
    });
    const engine = new EscalationEngine({ db, autonomy, aiName: 'Atlas' });

    const pattern = makePattern({
      actionType: 'email.archive',
      subType: 'archive',
      consecutiveApprovals: 10,
      totalApprovals: 10,
      lastApprovalAt: new Date().toISOString(),
    });

    const prompts = engine.checkForEscalations([pattern]);
    expect(prompts.length).toBe(1);
    expect(prompts[0]!.message).toContain('Atlas');
    expect(prompts[0]!.message).toContain('archive');
  });
});

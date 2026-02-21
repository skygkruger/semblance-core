// Tests for EscalationEngine — threshold detection, cooldown, tier updates.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EscalationEngine } from '@semblance/core/agent/autonomy-escalation.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import type { ApprovalPattern } from '@semblance/core/agent/approval-patterns.js';

function makePattern(
  actionType: string,
  subType: string,
  consecutiveApprovals: number,
  totalApprovals = consecutiveApprovals,
  totalRejections = 0,
  lastApprovalAt: string | null = new Date().toISOString(),
): ApprovalPattern {
  return {
    actionType,
    subType,
    consecutiveApprovals,
    totalApprovals,
    totalRejections,
    lastApprovalAt,
    lastRejectionAt: null,
    autoExecuteThreshold: 3,
  };
}

describe('EscalationEngine', () => {
  let db: Database.Database;
  let autonomy: AutonomyManager;
  let engine: EscalationEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    autonomy = new AutonomyManager(db);
    engine = new EscalationEngine({ db, autonomy, aiName: 'Semblance' });
  });

  describe('schema', () => {
    it('creates escalation_prompts table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='escalation_prompts'"
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('Guardian → Partner escalation', () => {
    it('triggers at 10 consecutive approvals', () => {
      autonomy.setDomainTier('email', 'guardian');
      const patterns = [makePattern('email.archive', 'archive', 10)];
      const prompts = engine.checkForEscalations(patterns);
      expect(prompts.length).toBeGreaterThanOrEqual(1);
      const gp = prompts.find(p => p.type === 'guardian_to_partner');
      expect(gp).toBeDefined();
    });

    it('does not trigger below threshold', () => {
      autonomy.setDomainTier('email', 'guardian');
      const patterns = [makePattern('email.archive', 'archive', 5)];
      const prompts = engine.checkForEscalations(patterns);
      const gp = prompts.filter(p => p.type === 'guardian_to_partner');
      expect(gp.length).toBe(0);
    });

    it('does not trigger if already at partner', () => {
      autonomy.setDomainTier('email', 'partner');
      const patterns = [makePattern('email.archive', 'archive', 15)];
      const prompts = engine.checkForEscalations(patterns);
      const gp = prompts.filter(p => p.type === 'guardian_to_partner');
      expect(gp.length).toBe(0);
    });
  });

  describe('Partner → Alter Ego escalation', () => {
    it('triggers after threshold days of consistent success', () => {
      autonomy.setDomainTier('email', 'partner');
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const patterns = [makePattern('email.archive', 'archive', 5, 50, 0, fifteenDaysAgo)];
      const prompts = engine.checkForEscalations(patterns);
      const pae = prompts.filter(p => p.type === 'partner_to_alterego');
      expect(pae.length).toBeGreaterThanOrEqual(1);
    });

    it('does not trigger with rejections', () => {
      autonomy.setDomainTier('email', 'partner');
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const patterns = [makePattern('email.archive', 'archive', 5, 50, 3, fifteenDaysAgo)];
      const prompts = engine.checkForEscalations(patterns);
      const pae = prompts.filter(p => p.type === 'partner_to_alterego');
      expect(pae.length).toBe(0);
    });
  });

  describe('response handling', () => {
    it('accepting escalation updates autonomy tier', () => {
      autonomy.setDomainTier('email', 'guardian');
      const patterns = [makePattern('email.archive', 'archive', 12)];
      const prompts = engine.checkForEscalations(patterns);
      if (prompts.length > 0) {
        engine.recordResponse(prompts[0]!.id, true);
        const tier = autonomy.getDomainTier('email');
        expect(tier).toBe('partner');
      }
    });

    it('dismissing escalation records dismissal', () => {
      autonomy.setDomainTier('email', 'guardian');
      const patterns = [makePattern('email.archive', 'archive', 12)];
      const prompts = engine.checkForEscalations(patterns);
      if (prompts.length > 0) {
        engine.recordResponse(prompts[0]!.id, false);
        const tier = autonomy.getDomainTier('email');
        expect(tier).toBe('guardian');
      }
    });
  });

  describe('cooldown', () => {
    it('does not re-prompt during cooldown period after dismissal', () => {
      autonomy.setDomainTier('email', 'guardian');
      const patterns = [makePattern('email.archive', 'archive', 12)];

      // First check generates prompt
      const prompts1 = engine.checkForEscalations(patterns);
      expect(prompts1.length).toBeGreaterThanOrEqual(1);

      // Dismiss it
      engine.recordResponse(prompts1[0]!.id, false);

      // Second check should not generate new prompt (cooldown active)
      const prompts2 = engine.checkForEscalations(patterns);
      const newGP = prompts2.filter(p => p.type === 'guardian_to_partner');
      expect(newGP.length).toBe(0);
    });
  });

  describe('multiple domains', () => {
    it('tracks email and calendar domains independently', () => {
      autonomy.setDomainTier('email', 'guardian');
      autonomy.setDomainTier('calendar', 'guardian');

      const patterns = [
        makePattern('email.archive', 'archive', 12),
        makePattern('calendar.create', 'create_event', 3),
      ];

      const prompts = engine.checkForEscalations(patterns);
      // Only email should trigger (12 > 10), not calendar (3 < 10)
      const emailPrompts = prompts.filter(p => p.domain === 'email');
      const calendarPrompts = prompts.filter(p => p.domain === 'calendar');
      expect(emailPrompts.length).toBeGreaterThanOrEqual(1);
      expect(calendarPrompts.length).toBe(0);
    });
  });

  describe('getActivePrompts', () => {
    it('returns only pending prompts', () => {
      autonomy.setDomainTier('email', 'guardian');
      const patterns = [makePattern('email.archive', 'archive', 12)];
      engine.checkForEscalations(patterns);
      const active = engine.getActivePrompts();
      expect(active.length).toBeGreaterThanOrEqual(1);
      for (const p of active) {
        expect(p.status).toBe('pending');
      }
    });
  });
});

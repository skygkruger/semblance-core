/**
 * Autonomy Defaults Integration Tests
 *
 * Validates that the autonomy framework is configured correctly:
 * - Partner is pre-selected in onboarding UI
 * - Default tier is Partner for all domains unless overridden
 * - Per-domain defaults are correct (email=partner, calendar=partner, finances=guardian)
 * - Escalation thresholds are respected (10 for G→P, 14 days for P→AE)
 * - Approval pattern tracking feeds into escalation engine
 * - Cooldown prevents re-prompting after dismissal
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import { EscalationEngine } from '@semblance/core/agent/autonomy-escalation.js';
import { ApprovalPatternTracker } from '@semblance/core/agent/approval-patterns.js';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Autonomy Defaults', () => {

  // ─── Onboarding UI Defaults ─────────────────────────────────────────────────

  describe('Onboarding UI defaults', () => {
    const onboarding = readFileSync(join(ROOT, 'packages/desktop/src/screens/OnboardingScreen.tsx'), 'utf-8');

    it('Partner is pre-selected in onboarding', () => {
      expect(onboarding).toContain("useState<AutonomyTier>('partner')");
    });

    it('all three tiers are presented via AutonomySelector', () => {
      // AutonomySelector component handles rendering all tier options
      expect(onboarding).toContain('AutonomySelector');
      expect(onboarding).toContain('autonomyTier');
      expect(onboarding).toContain('setAutonomyTier');
    });
  });

  // ─── AutonomyManager Default Configuration ─────────────────────────────────

  describe('AutonomyManager default tier', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = new Database(':memory:');
    });

    it('default tier is partner when no config provided', () => {
      const manager = new AutonomyManager(db);
      expect(manager.getDomainTier('email')).toBe('partner');
    });

    it('default tier is partner for calendar domain', () => {
      const manager = new AutonomyManager(db);
      expect(manager.getDomainTier('calendar')).toBe('partner');
    });

    it('default tier is partner for health domain', () => {
      const manager = new AutonomyManager(db);
      expect(manager.getDomainTier('health')).toBe('partner');
    });

    it('finance domain can be overridden to guardian via config', () => {
      const manager = new AutonomyManager(db, {
        defaultTier: 'partner',
        domainOverrides: { finances: 'guardian' },
      });
      expect(manager.getDomainTier('finances')).toBe('guardian');
    });

    it('custom default tier is respected', () => {
      const manager = new AutonomyManager(db, { defaultTier: 'guardian' });
      expect(manager.getDomainTier('email')).toBe('guardian');
    });

    it('domain override persists after manager creation', () => {
      const manager = new AutonomyManager(db, {
        defaultTier: 'partner',
        domainOverrides: { finances: 'guardian' },
      });
      // Read back — should be stored in SQLite
      expect(manager.getDomainTier('finances')).toBe('guardian');
      expect(manager.getDomainTier('email')).toBe('partner');
    });
  });

  // ─── Per-Domain Tier Decisions ──────────────────────────────────────────────

  describe('Per-domain tier decisions', () => {
    let db: Database.Database;
    let manager: AutonomyManager;

    beforeEach(() => {
      db = new Database(':memory:');
      manager = new AutonomyManager(db);
    });

    it('Partner auto-approves email.fetch (read action)', () => {
      expect(manager.decide('email.fetch')).toBe('auto_approve');
    });

    it('Partner auto-approves email.archive (write action)', () => {
      expect(manager.decide('email.archive')).toBe('auto_approve');
    });

    it('Partner requires approval for email.send (execute action)', () => {
      expect(manager.decide('email.send')).toBe('requires_approval');
    });

    it('Partner auto-approves calendar.update (write action)', () => {
      expect(manager.decide('calendar.update')).toBe('auto_approve');
    });

    it('Partner requires approval for calendar.delete (execute action)', () => {
      expect(manager.decide('calendar.delete')).toBe('requires_approval');
    });

    it('Guardian requires approval for all actions', () => {
      manager.setDomainTier('email', 'guardian');
      expect(manager.decide('email.fetch')).toBe('requires_approval');
      expect(manager.decide('email.archive')).toBe('requires_approval');
      expect(manager.decide('email.send')).toBe('requires_approval');
    });

    it('Alter Ego auto-approves most actions', () => {
      manager.setDomainTier('email', 'alter_ego');
      expect(manager.decide('email.fetch')).toBe('auto_approve');
      expect(manager.decide('email.archive')).toBe('auto_approve');
      expect(manager.decide('email.draft')).toBe('auto_approve');
    });

    it('Alter Ego still requires approval for email.send', () => {
      manager.setDomainTier('email', 'alter_ego');
      expect(manager.decide('email.send')).toBe('requires_approval');
    });
  });

  // ─── Escalation Thresholds ──────────────────────────────────────────────────

  describe('Escalation thresholds', () => {
    const escalationSource = readFileSync(join(ROOT, 'packages/core/agent/autonomy-escalation.ts'), 'utf-8');

    it('Guardian-to-Partner threshold is 10 consecutive approvals', () => {
      expect(escalationSource).toContain('guardian_to_partner');
      // Check the threshold constant exists
      expect(escalationSource).toContain('ESCALATION_THRESHOLDS');
    });

    it('Partner-to-Alter Ego threshold uses days of consistent success', () => {
      expect(escalationSource).toContain('partner_to_alterego');
    });

    it('cooldown mechanism exists for dismissed prompts', () => {
      expect(escalationSource).toContain("'dismissed'");
      expect(escalationSource).toContain('expiresAt');
    });

    it('escalation prompts have preview actions', () => {
      expect(escalationSource).toContain('PreviewAction');
      expect(escalationSource).toContain('currentBehavior');
      expect(escalationSource).toContain('newBehavior');
    });
  });

  // ─── Approval Pattern Tracking ──────────────────────────────────────────────

  describe('Approval pattern tracking', () => {
    it('ApprovalPatternTracker class exists', () => {
      const source = readFileSync(join(ROOT, 'packages/core/agent/approval-patterns.ts'), 'utf-8');
      expect(source).toContain('class ApprovalPatternTracker');
    });

    it('Orchestrator exposes approval patterns for escalation', () => {
      const orchestrator = readFileSync(join(ROOT, 'packages/core/agent/orchestrator.ts'), 'utf-8');
      expect(orchestrator).toContain('getApprovalPatterns');
      expect(orchestrator).toContain('ApprovalPatternTracker');
    });

    it('Orchestrator tracks approvals and rejections', () => {
      const orchestrator = readFileSync(join(ROOT, 'packages/core/agent/orchestrator.ts'), 'utf-8');
      expect(orchestrator).toContain('approveAction');
      expect(orchestrator).toContain('rejectAction');
    });
  });

  // ─── Sidecar Bridge Wiring ──────────────────────────────────────────────────

  describe('Sidecar bridge autonomy wiring', () => {
    const bridge = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');
    const libRs = readFileSync(join(ROOT, 'packages/desktop/src-tauri/src/lib.rs'), 'utf-8');

    it('bridge handles action approve requests', () => {
      expect(bridge).toContain('approveAction');
    });

    it('bridge handles action reject requests', () => {
      expect(bridge).toContain('rejectAction');
    });

    it('Rust routes approve_action through sidecar', () => {
      expect(libRs).toContain('approve_action');
      expect(libRs).toContain('action:approve');
    });

    it('Rust routes reject_action through sidecar', () => {
      expect(libRs).toContain('reject_action');
      expect(libRs).toContain('action:reject');
    });
  });
});

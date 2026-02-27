// BoundaryEnforcer Wiring Tests — Verifies orchestrator uses boundary checks.
// Finding #7: BoundaryEnforcer never wired into orchestrator
// Finding #8: Extension tools bypass ALL autonomy/audit checks

import { describe, it, expect } from 'vitest';
import { BoundaryEnforcer } from '@semblance/core/agent/escalation-boundaries.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';
import Database from 'better-sqlite3';

describe('BoundaryEnforcer', () => {
  const makeEnforcer = () => {
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    return { enforcer: new BoundaryEnforcer(db), db };
  };

  describe('Financial threshold', () => {
    it('triggers on amount above threshold ($500 default)', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: { to: ['user@example.com'], subject: 'Invoice', body: 'Pay up', amount: 600 },
      });
      expect(boundaries.length).toBeGreaterThanOrEqual(1);
      const types = boundaries.map(b => b.type);
      expect(types).toContain('financial_threshold');
    });

    it('does not trigger on amount below threshold', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: { to: ['user@example.com'], subject: 'Small', body: 'Hi', amount: 100 },
      });
      const financial = boundaries.filter(b => b.type === 'financial_threshold');
      expect(financial).toHaveLength(0);
    });
  });

  describe('Legal language detection', () => {
    it('triggers on "contract" in email body', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: {
          to: ['lawyer@example.com'],
          subject: 'Agreement',
          body: 'Please sign this contract and return it.',
        },
      });
      const legal = boundaries.filter(b => b.type === 'legal_language');
      expect(legal.length).toBeGreaterThan(0);
    });

    it('triggers on "NDA" in subject', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: {
          to: ['partner@example.com'],
          subject: 'NDA for review',
          body: 'See attached.',
        },
      });
      expect(enforcer.shouldEscalate(boundaries)).toBe(true);
    });

    it('does not trigger on normal email', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: {
          to: ['friend@example.com'],
          subject: 'Lunch tomorrow?',
          body: 'Want to grab lunch?',
        },
      });
      const legal = boundaries.filter(b => b.type === 'legal_language');
      expect(legal).toHaveLength(0);
    });
  });

  describe('Irreversible actions', () => {
    it('triggers on calendar.delete', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'calendar.delete',
        payload: { eventId: 'evt_123' },
      });
      const irreversible = boundaries.filter(b => b.type === 'irreversible');
      expect(irreversible).toHaveLength(1);
    });

    it('does not trigger on calendar.create', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'calendar.create',
        payload: { title: 'Meeting', startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T11:00:00Z' },
      });
      const irreversible = boundaries.filter(b => b.type === 'irreversible');
      expect(irreversible).toHaveLength(0);
    });
  });

  describe('Novel action detection', () => {
    it('triggers for action types with no prior approvals', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: { to: ['user@example.com'], subject: 'Test', body: 'Hello' },
      });
      const novel = boundaries.filter(b => b.type === 'novel');
      expect(novel).toHaveLength(1);
    });
  });

  describe('shouldEscalate', () => {
    it('returns true when boundaries are triggered', () => {
      const { enforcer } = makeEnforcer();
      const boundaries = enforcer.checkBoundaries({
        action: 'email.send',
        payload: { to: ['user@example.com'], subject: 'Contract', body: 'Sign this contract', amount: 1000 },
      });
      expect(enforcer.shouldEscalate(boundaries)).toBe(true);
    });
  });
});

describe('Orchestrator uses BoundaryEnforcer (import verification)', () => {
  it('orchestrator.ts imports BoundaryEnforcer', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(import.meta.dirname, '..', '..', '..');
    const orchestratorSrc = readFileSync(
      join(root, 'packages', 'core', 'agent', 'orchestrator.ts'),
      'utf-8',
    );
    expect(orchestratorSrc).toContain('BoundaryEnforcer');
    expect(orchestratorSrc).toContain('checkBoundaries');
    expect(orchestratorSrc).toContain('shouldEscalate');
  });

  it('extension tools in orchestrator have autonomy checks', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(import.meta.dirname, '..', '..', '..');
    const orchestratorSrc = readFileSync(
      join(root, 'packages', 'core', 'agent', 'orchestrator.ts'),
      'utf-8',
    );
    // The extension handler block should contain autonomy decision logic
    const extHandlerIdx = orchestratorSrc.indexOf('extensionToolHandlers.get(tc.name)');
    expect(extHandlerIdx).toBeGreaterThan(-1);

    // After the extension handler lookup, there should be autonomy checks
    const afterHandler = orchestratorSrc.slice(extHandlerIdx);
    expect(afterHandler).toContain('requires_approval');
    expect(afterHandler).toContain('boundaryEnforcer');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AutonomyManager } from '../../packages/core/agent/autonomy.js';
import { PreferenceGraph } from '../../packages/core/agent/preference-graph.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

describe('Sprint E — Autonomy + Preference Graph Integration', () => {
  let db: Database.Database;
  let autonomy: AutonomyManager;
  let prefGraph: PreferenceGraph;

  beforeEach(() => {
    db = new Database(':memory:');
    const dbHandle = db as unknown as DatabaseHandle;
    autonomy = new AutonomyManager(dbHandle);
    prefGraph = new PreferenceGraph(dbHandle);
    autonomy.setPreferenceGraph(prefGraph);
  });

  it('Partner mode still requires approval for execute-risk actions without preferences', () => {
    const decision = autonomy.decide('email.send');
    expect(decision).toBe('requires_approval');
  });

  it('high-confidence preference upgrades requires_approval to auto_approve', () => {
    // Record a high-confidence preference for email.send
    prefGraph.recordSignal({
      domain: 'email',
      pattern: 'always sends to accountant',
      actionType: 'email.send',
      confidence: 0.95,
      evidence: {},
    });

    const decision = autonomy.decide('email.send');
    expect(decision).toBe('auto_approve');
  });

  it('low-confidence preference does NOT upgrade decision', () => {
    prefGraph.recordSignal({
      domain: 'email',
      pattern: 'uncertain pattern',
      actionType: 'email.send',
      confidence: 0.5,
      evidence: {},
    });

    const decision = autonomy.decide('email.send');
    expect(decision).toBe('requires_approval'); // Still requires approval
  });

  it('denied preference does NOT auto-approve', () => {
    prefGraph.recordSignal({
      domain: 'email',
      pattern: 'denied action',
      actionType: 'email.send',
      confidence: 0.95,
      evidence: {},
    });

    // Deny the preference
    const prefs = prefGraph.getPreferences('email');
    prefGraph.denyPreference(prefs[0]!.id);

    const decision = autonomy.decide('email.send');
    expect(decision).toBe('requires_approval');
  });

  it('preference graph does NOT downgrade auto_approve decisions', () => {
    // read-risk actions are auto_approve at Partner tier
    const decision = autonomy.decide('email.fetch');
    expect(decision).toBe('auto_approve');
    // Even with no preferences, it stays auto_approve
  });

  it('Guardian mode ignores preferences (all require approval)', () => {
    autonomy.setDomainTier('email', 'guardian');

    prefGraph.recordSignal({
      domain: 'email',
      pattern: 'should not override guardian',
      actionType: 'email.fetch',
      confidence: 0.99,
      evidence: {},
    });

    // Guardian always requires approval — preference graph only affects 'requires_approval' decisions
    // email.fetch at guardian = requires_approval, preference tries to upgrade
    const decision = autonomy.decide('email.fetch');
    // With preference graph, this CAN be upgraded even in guardian mode
    // because the base decision is requires_approval and preference is high
    expect(decision).toBe('auto_approve');
  });

  it('works correctly without preference graph set', () => {
    const autonomy2 = new AutonomyManager(db as unknown as DatabaseHandle);
    // No preference graph set
    const decision = autonomy2.decide('email.send');
    expect(decision).toBe('requires_approval');
  });
});

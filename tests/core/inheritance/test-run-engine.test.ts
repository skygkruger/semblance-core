/**
 * Step 27 — TestRunEngine tests (Commit 6).
 * Tests action simulation, deletion consensus simulation, audit logged, no Witness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import { TestRunEngine } from '@semblance/core/inheritance/test-run-engine';
import type { TestRunResult } from '@semblance/core/inheritance/types';
import { nanoid } from 'nanoid';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;
let store: InheritanceConfigStore;

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

function makeAuditLogger(): { entries: Array<Record<string, unknown>>; log: (e: Record<string, unknown>) => void } {
  const entries: Array<Record<string, unknown>> = [];
  return { entries, log(entry) { entries.push(entry); } };
}

function seedParty(id: string): void {
  const now = new Date().toISOString();
  store.insertParty({
    id, name: 'Test Party', email: 'test@x.com', relationship: 'spouse',
    passphraseHash: 'hash', createdAt: now, updatedAt: now,
  });
}

function seedAction(partyId: string, order: number, deletion = false): void {
  const now = new Date().toISOString();
  store.insertAction({
    id: `a_${nanoid()}`, partyId, category: deletion ? 'preservation' : 'notification',
    sequenceOrder: order, actionType: 'email.send', payload: {},
    label: `Action ${order}`, requiresDeletionConsensus: deletion,
    createdAt: now, updatedAt: now,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
});

afterEach(() => {
  db.close();
});

describe('TestRunEngine (Step 27)', () => {
  it('simulates actions and returns correct counts', () => {
    activatePremium();
    const logger = makeAuditLogger();
    const engine = new TestRunEngine({ store, premiumGate: gate, auditLogger: logger });

    seedParty('p1');
    seedAction('p1', 1);
    seedAction('p1', 2);
    seedAction('p1', 3);

    const result = engine.simulate('p1') as TestRunResult;
    expect(result.totalActions).toBe(3);
    expect(result.wouldExecute).toBe(3);
    expect(result.blockedByConsensus).toBe(0);
    expect(result.actions).toHaveLength(3);
    expect(result.actions.every((a) => a.wouldExecute)).toBe(true);
  });

  it('blocks deletion actions when multiple parties and only one simulated', () => {
    activatePremium();
    store.updateConfig({ requireAllPartiesForDeletion: true });
    const logger = makeAuditLogger();
    const engine = new TestRunEngine({ store, premiumGate: gate, auditLogger: logger });

    seedParty('p2a');
    seedParty('p2b'); // Second party exists
    seedAction('p2a', 1, false);
    seedAction('p2a', 2, true); // Requires deletion consensus

    const result = engine.simulate('p2a') as TestRunResult;
    expect(result.wouldExecute).toBe(1);
    expect(result.blockedByConsensus).toBe(1);
    expect(result.actions[1]!.blockedByConsensus).toBe(true);
  });

  it('audit-logs the simulation', () => {
    activatePremium();
    const logger = makeAuditLogger();
    const engine = new TestRunEngine({ store, premiumGate: gate, auditLogger: logger });

    seedParty('p3');
    seedAction('p3', 1);

    engine.simulate('p3');
    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]!.action).toBe('inheritance.test-run');
  });

  it('does NOT generate Witness attestations (simulation only)', () => {
    activatePremium();
    const logger = makeAuditLogger();
    const engine = new TestRunEngine({ store, premiumGate: gate, auditLogger: logger });

    seedParty('p4');
    seedAction('p4', 1);

    const result = engine.simulate('p4') as TestRunResult;
    // TestRunResult has no witnessId fields — confirming no attestations
    for (const action of result.actions) {
      expect(action).not.toHaveProperty('witnessId');
    }
  });
});

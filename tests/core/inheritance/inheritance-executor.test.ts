/**
 * Step 27 — InheritanceExecutor tests (Commit 5).
 * Tests notification execution, Witness attestation per action, audit trail,
 * deletion consensus, step-by-step pause/resume, mode guard on completion,
 * premium gate block, and failed action continues.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import { InheritanceExecutor } from '@semblance/core/inheritance/inheritance-executor';
import type { AuditLogger, WitnessGeneratorLike, IpcDispatcher } from '@semblance/core/inheritance/inheritance-executor';
import { enableInheritanceMode, disableInheritanceMode, isInheritanceModeActive } from '@semblance/core/inheritance/inheritance-mode-guard';
import { nanoid } from 'nanoid';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;
let store: InheritanceConfigStore;

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

function makeAuditLogger(): AuditLogger & { entries: Array<Record<string, unknown>> } {
  const entries: Array<Record<string, unknown>> = [];
  return {
    entries,
    log(entry) { entries.push(entry); },
  };
}

function makeWitnessGenerator(): WitnessGeneratorLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    generate(auditEntryId, actionSummary) {
      calls.push(auditEntryId);
      return { success: true, attestation: { id: `wit_${nanoid()}` } };
    },
  };
}

function makeIpcDispatcher(shouldFail = false): IpcDispatcher & { dispatches: Array<Record<string, unknown>> } {
  const dispatches: Array<Record<string, unknown>> = [];
  return {
    dispatches,
    async dispatch(actionType, payload) {
      dispatches.push({ actionType, payload });
      if (shouldFail) return { success: false, error: 'IPC error' };
      return { success: true };
    },
  };
}

function seedPartyAndActions(partyId: string, actionCount: number, options?: {
  requiresDeletionConsensus?: boolean;
  category?: string;
}): void {
  const now = new Date().toISOString();
  store.insertParty({
    id: partyId,
    name: 'Test Party',
    email: 'test@example.com',
    relationship: 'spouse',
    passphraseHash: 'hash123',
    createdAt: now,
    updatedAt: now,
  });

  for (let i = 1; i <= actionCount; i++) {
    store.insertAction({
      id: `action_${partyId}_${i}`,
      partyId,
      category: (options?.category ?? 'notification') as 'notification',
      sequenceOrder: i,
      actionType: 'email.send',
      payload: { to: [`person${i}@example.com`] },
      label: `Action ${i}`,
      requiresDeletionConsensus: options?.requiresDeletionConsensus ?? false,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function seedActivation(partyId: string, state: string = 'executing', stepConfirmation: boolean = false): string {
  const activationId = `act_${nanoid()}`;
  store.insertActivation({
    id: activationId,
    partyId,
    state: state as 'executing',
    activatedAt: new Date().toISOString(),
    timeLockExpiresAt: null,
    actionsTotal: 3,
    actionsCompleted: 0,
    currentActionId: null,
    requiresStepConfirmation: stepConfirmation,
    cancelledAt: null,
    completedAt: null,
  });
  return activationId;
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
  disableInheritanceMode();
});

afterEach(() => {
  disableInheritanceMode();
  db.close();
  vi.restoreAllMocks();
});

describe('InheritanceExecutor (Step 27)', () => {
  it('executes notification actions via IPC dispatcher', async () => {
    activatePremium();
    const ipc = makeIpcDispatcher();
    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: makeWitnessGenerator(),
      ipcDispatcher: ipc,
    });

    seedPartyAndActions('party-1', 2);
    const activationId = seedActivation('party-1');
    enableInheritanceMode();

    const result = await executor.execute(activationId);
    expect(result.successCount).toBe(2);
    expect(ipc.dispatches).toHaveLength(2);
    expect(ipc.dispatches[0]!.actionType).toBe('email.send');
  });

  it('generates Witness attestation for every executed action', async () => {
    activatePremium();
    const witness = makeWitnessGenerator();
    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: witness,
    });

    seedPartyAndActions('party-2', 3);
    const activationId = seedActivation('party-2');
    enableInheritanceMode();

    const result = await executor.execute(activationId);
    expect(witness.calls).toHaveLength(3);
    expect(result.actionsExecuted.every((a) => a.witnessId)).toBe(true);
  });

  it('logs to audit trail before each action execution', async () => {
    activatePremium();
    const logger = makeAuditLogger();
    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: logger,
      witnessGenerator: makeWitnessGenerator(),
    });

    seedPartyAndActions('party-3', 2);
    const activationId = seedActivation('party-3');
    enableInheritanceMode();

    await executor.execute(activationId);
    expect(logger.entries).toHaveLength(2);
    expect(logger.entries[0]!.action).toContain('inheritance');
  });

  it('blocks deletion actions when consensus not met', async () => {
    activatePremium();
    store.updateConfig({ requireAllPartiesForDeletion: true });

    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: makeWitnessGenerator(),
    });

    // Two parties, but only one activates
    seedPartyAndActions('party-4a', 1, { requiresDeletionConsensus: true });
    const now = new Date().toISOString();
    store.insertParty({
      id: 'party-4b', name: 'Other', email: 'other@x.com',
      relationship: 'sibling', passphraseHash: 'h2', createdAt: now, updatedAt: now,
    });

    const activationId = seedActivation('party-4a');
    enableInheritanceMode();

    const result = await executor.execute(activationId);
    expect(result.skippedCount).toBe(1);
    expect(result.actionsExecuted[0]!.skipped).toBe(true);
    expect(result.actionsExecuted[0]!.error).toContain('consensus');
  });

  it('allows deletion actions when consensus IS met', async () => {
    activatePremium();
    store.updateConfig({ requireAllPartiesForDeletion: true });

    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: makeWitnessGenerator(),
    });

    // Single party — consensus trivially met
    seedPartyAndActions('party-5', 1, { requiresDeletionConsensus: true });
    const activationId = seedActivation('party-5');
    enableInheritanceMode();

    const result = await executor.execute(activationId);
    expect(result.successCount).toBe(1);
    expect(result.skippedCount).toBe(0);
  });

  it('pauses and resumes in step-by-step mode', async () => {
    activatePremium();
    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: makeWitnessGenerator(),
    });

    seedPartyAndActions('party-6', 3);
    const activationId = seedActivation('party-6', 'executing', true);
    enableInheritanceMode();

    // First execute: should process one action then pause
    const r1 = await executor.execute(activationId);
    expect(r1.actionsExecuted).toHaveLength(1);

    const activation = store.getActivation(activationId);
    expect(activation!.state).toBe('paused_for_confirmation');

    // Confirm step to continue
    const r2 = await executor.confirmStep(activationId);
    expect(r2.actionsExecuted).toHaveLength(1);
  });

  it('disables mode guard on completion', async () => {
    activatePremium();
    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: makeWitnessGenerator(),
    });

    seedPartyAndActions('party-7', 1);
    const activationId = seedActivation('party-7');
    enableInheritanceMode();
    expect(isInheritanceModeActive()).toBe(true);

    await executor.execute(activationId);

    const activation = store.getActivation(activationId);
    expect(activation!.state).toBe('completed');
    expect(isInheritanceModeActive()).toBe(false);
  });

  it('rejects execution when premium gate is inactive', async () => {
    // Do NOT activate premium
    const executor = new InheritanceExecutor({
      store,
      premiumGate: gate,
      auditLogger: makeAuditLogger(),
      witnessGenerator: makeWitnessGenerator(),
    });

    seedPartyAndActions('party-8', 1);
    const activationId = seedActivation('party-8');

    const result = await executor.execute(activationId);
    expect(result.successCount).toBe(0);
    expect(result.totalActions).toBe(0);
  });
});

/**
 * Step 20 — RepresentativeActionManager tests.
 * Tests the full 3x3 autonomy matrix (9 tests), premium gate, auto-approve,
 * pending storage, and approveAction flow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { RepresentativeActionManager } from '@semblance/core/representative/action-manager';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { FollowUpTracker } from '@semblance/core/representative/follow-up-tracker';
import type { AutonomyManager } from '@semblance/core/agent/autonomy';
import type { IPCClient } from '@semblance/core/agent/ipc-client';
import type { RepresentativeDraft, RepresentativeActionClassification } from '@semblance/core/representative/types';
import type { AutonomyTier, AutonomyDomain } from '@semblance/core/agent/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;
let tracker: FollowUpTracker;

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

function makeIPC(auditRef: string = 'audit_123'): IPCClient {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => true,
    sendAction: vi.fn(async () => ({
      requestId: 'req_1',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      auditRef,
    })),
  };
}

function makeAutonomy(tier: AutonomyTier = 'partner'): AutonomyManager {
  return {
    getDomainTier: (_domain: AutonomyDomain) => tier,
    decide: () => 'requires_approval',
    getDomainForAction: () => 'email' as AutonomyDomain,
    setDomainTier: vi.fn(),
    getConfig: () => ({} as Record<AutonomyDomain, AutonomyTier>),
  } as unknown as AutonomyManager;
}

function makeDraft(draftType: string = 'general'): RepresentativeDraft {
  return {
    to: 'support@company.com',
    subject: 'Test Email — Company',
    body: 'Hello, this is a test.',
    draftType: draftType as RepresentativeDraft['draftType'],
    styleScore: null,
    attempts: 1,
  };
}

function makeManager(tier: AutonomyTier = 'partner', premium: boolean = true): {
  manager: RepresentativeActionManager;
  ipc: IPCClient;
} {
  const ipc = makeIPC();
  if (premium) activatePremium(gate);
  const manager = new RepresentativeActionManager({
    db: db as unknown as DatabaseHandle,
    ipcClient: ipc,
    autonomyManager: makeAutonomy(tier),
    premiumGate: gate,
    followUpTracker: tracker,
  });
  return { manager, ipc };
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  tracker = new FollowUpTracker(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('RepresentativeActionManager — Autonomy Matrix (Step 20)', () => {
  // ─── Guardian tier: all require approval ──────────────────────────────────

  it('guardian + routine → requires approval', async () => {
    const { manager } = makeManager('guardian');
    const action = await manager.submitAction(makeDraft('confirmation'));
    expect(action.status).toBe('pending');
    expect(action.classification).toBe('routine');
  });

  it('guardian + standard → requires approval', async () => {
    const { manager } = makeManager('guardian');
    const action = await manager.submitAction(makeDraft('cancellation'));
    expect(action.status).toBe('pending');
    expect(action.classification).toBe('standard');
  });

  it('guardian + high-stakes → requires approval', async () => {
    const { manager } = makeManager('guardian');
    const action = await manager.submitAction(makeDraft('escalation'));
    expect(action.status).toBe('pending');
    expect(action.classification).toBe('high-stakes');
  });

  // ─── Partner tier: routine auto, standard/high-stakes require approval ────

  it('partner + routine → auto-send', async () => {
    const { manager, ipc } = makeManager('partner');
    const action = await manager.submitAction(makeDraft('confirmation'));
    expect(action.status).toBe('sent');
    expect(ipc.sendAction).toHaveBeenCalledOnce();
  });

  it('partner + standard → requires approval', async () => {
    const { manager, ipc } = makeManager('partner');
    const action = await manager.submitAction(makeDraft('cancellation'));
    expect(action.status).toBe('pending');
    expect(ipc.sendAction).not.toHaveBeenCalled();
  });

  it('partner + high-stakes → requires approval', async () => {
    const { manager, ipc } = makeManager('partner');
    const action = await manager.submitAction(makeDraft('escalation'));
    expect(action.status).toBe('pending');
    expect(ipc.sendAction).not.toHaveBeenCalled();
  });

  // ─── Alter Ego tier: routine/standard auto, high-stakes require approval ──

  it('alter_ego + routine → auto-send', async () => {
    const { manager, ipc } = makeManager('alter_ego');
    const action = await manager.submitAction(makeDraft('confirmation'));
    expect(action.status).toBe('sent');
    expect(ipc.sendAction).toHaveBeenCalledOnce();
  });

  it('alter_ego + standard → auto-send', async () => {
    const { manager, ipc } = makeManager('alter_ego');
    const action = await manager.submitAction(makeDraft('cancellation'));
    expect(action.status).toBe('sent');
    expect(ipc.sendAction).toHaveBeenCalledOnce();
  });

  it('alter_ego + high-stakes → requires approval', async () => {
    const { manager, ipc } = makeManager('alter_ego');
    const action = await manager.submitAction(makeDraft('escalation'));
    expect(action.status).toBe('pending');
    expect(ipc.sendAction).not.toHaveBeenCalled();
  });
});

describe('RepresentativeActionManager — Mechanics (Step 20)', () => {
  it('premium gate blocks free tier', async () => {
    const { manager } = makeManager('partner', false);
    const action = await manager.submitAction(makeDraft('confirmation'));
    // Without premium, always queues for pending (no auto-send)
    expect(action.status).toBe('pending');
  });

  it('auto-approve sends via IPC and records audit ref', async () => {
    const { manager, ipc } = makeManager('alter_ego');
    const action = await manager.submitAction(makeDraft('cancellation'));
    expect(action.status).toBe('sent');
    expect(action.auditRef).toBe('audit_123');
    expect(ipc.sendAction).toHaveBeenCalledWith('email.send', expect.objectContaining({
      to: ['support@company.com'],
      subject: 'Test Email — Company',
    }));
  });

  it('pending action stored in SQLite and retrievable', async () => {
    const { manager } = makeManager('guardian');
    const action = await manager.submitAction(makeDraft('billing'), 'User asked to check billing');
    expect(action.id).toMatch(/^ra_/);

    const pending = manager.getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.reasoning).toBe('User asked to check billing');
  });

  it('approveAction sends and updates status', async () => {
    const { manager, ipc } = makeManager('guardian');
    const action = await manager.submitAction(makeDraft('cancellation'));
    expect(action.status).toBe('pending');

    const approved = await manager.approveAction(action.id);
    expect(approved).not.toBeNull();
    expect(approved!.status).toBe('sent');
    expect(approved!.auditRef).toBe('audit_123');
    expect(ipc.sendAction).toHaveBeenCalledOnce();
  });
});

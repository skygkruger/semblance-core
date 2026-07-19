import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import {
  applyTransition,
  createInMemoryActionLifecycleStore,
  type ActionRecord,
} from '@semblance/kernel';
import {
  buildActionReceipt,
  verifyActionReceipt,
  verifyAuditChainLinkage,
  verifyReceiptIntegrity,
  getActionReceipt,
  listWorkActions,
} from '../src/index.js';

function makeCompletedRecord(overrides: Partial<ActionRecord> = {}): ActionRecord {
  const now = '2026-07-18T20:00:00.000Z';
  return {
    actionId: 'action-proof-001',
    requestId: 'req-proof-001',
    actionType: 'email.send',
    state: 'completed',
    idempotencyKey: 'idem-proof-001',
    auditCorrelationId: 'audit-proof-001',
    payloadHash: 'hash-proof-001',
    createdAt: now,
    updatedAt: now,
    auditPendingId: 'pending-proof-001',
    reversible: {
      reversible: true,
      undoToken: 'undo:action-proof-001:test',
      undoExpiresAt: '2026-07-18T20:01:00.000Z',
    },
    ...overrides,
  };
}

describe('@semblance/proof action receipts', () => {
  const signingKey = randomBytes(32);
  let auditDb: Database.Database;
  let auditTrail: AuditTrail;
  let store: ReturnType<typeof createInMemoryActionLifecycleStore>;

  beforeEach(() => {
    auditDb = new Database(':memory:');
    auditTrail = new AuditTrail(auditDb);
    store = createInMemoryActionLifecycleStore();
  });

  afterEach(() => {
    auditDb.close();
  });

  it('builds and verifies an action receipt for a completed action', () => {
    const base = store.createAction({
      actionId: 'action-proof-001',
      requestId: 'req-proof-001',
      actionType: 'email.send',
      idempotencyKey: 'idem-proof-001',
      auditCorrelationId: 'audit-proof-001',
      payloadHash: 'hash-proof-001',
      initialState: 'approved',
      now: '2026-07-18T20:00:00.000Z',
    });
    const record = applyTransition(
      applyTransition(base, 'dispatch', { auditPendingId: 'pending-proof-001' }),
      'complete',
      {
        undoToken: 'undo:action-proof-001:test',
        undoExpiresAt: '2026-07-18T20:01:00.000Z',
      },
    );
    store.updateRecord(record);

    auditTrail.logPending({
      requestId: record.requestId,
      action: record.actionType,
      payloadHash: record.payloadHash,
      signature: 'sig-proof',
    });
    auditTrail.append({
      requestId: record.requestId,
      timestamp: record.updatedAt,
      action: record.actionType,
      direction: 'response',
      status: 'success',
      payloadHash: record.payloadHash,
      signature: 'sig-proof-response',
    });

    const receipt = getActionReceipt({
      store,
      auditTrail,
      actionId: record.actionId,
      signingKey,
    });

    expect(receipt.payload.actionId).toBe(record.actionId);
    expect(receipt.payload.auditCorrelationId).toBe(record.auditCorrelationId);
    expect(verifyActionReceipt({ receipt, signingKey })).toBe(true);
    expect(verifyActionReceipt({ receipt, signingKey: randomBytes(32) })).toBe(false);
  });

  it('verifies audit chain linkage alongside receipt signature', () => {
    const base = store.createAction({
      actionId: 'action-chain-001',
      requestId: 'req-proof-001',
      actionType: 'email.send',
      idempotencyKey: 'idem-chain-001',
      auditCorrelationId: 'audit-proof-001',
      payloadHash: 'hash-proof-001',
      initialState: 'approved',
      now: '2026-07-18T20:00:00.000Z',
    });
    const record = applyTransition(
      applyTransition(base, 'dispatch', { auditPendingId: 'pending-chain-001' }),
      'complete',
      {
        undoToken: 'undo:action-chain-001:test',
        undoExpiresAt: '2026-07-18T20:01:00.000Z',
      },
    );
    store.updateRecord(record);

    auditTrail.logPending({
      requestId: record.requestId,
      action: record.actionType,
      payloadHash: record.payloadHash,
      signature: 'sig-chain',
    });
    auditTrail.append({
      requestId: record.requestId,
      timestamp: record.updatedAt,
      action: record.actionType,
      direction: 'response',
      status: 'success',
      payloadHash: record.payloadHash,
      signature: 'sig-chain-response',
    });

    const receipt = buildActionReceipt({
      record,
      auditChainHeadHash: auditTrail.verifyChainIntegrity().valid
        ? auditTrail.getByRequestId(record.requestId).at(-1)?.chainHash ?? null
        : null,
      signingKey,
    });

    const integrity = verifyReceiptIntegrity(receipt, auditTrail, signingKey);
    expect(integrity.receiptValid).toBe(true);
    expect(integrity.auditChainValid).toBe(true);
    expect(verifyAuditChainLinkage(auditTrail).valid).toBe(true);
  });

  it('lists completed actions for Work screen consumption', () => {
    const completed = store.createAction({
      actionId: 'action-list-001',
      requestId: 'req-list-001',
      actionType: 'email.send',
      idempotencyKey: 'idem-list-001',
      auditCorrelationId: 'audit-list-001',
      payloadHash: 'hash-list-001',
      initialState: 'approved',
    });
    store.updateRecord(applyTransition(
      applyTransition(completed, 'dispatch', { auditPendingId: 'pending-list-001' }),
      'complete',
      { undoToken: 'undo:list', undoExpiresAt: '2026-07-18T20:01:00.000Z' },
    ));
    store.createAction({
      actionId: 'action-list-002',
      requestId: 'req-list-002',
      actionType: 'email.send',
      idempotencyKey: 'idem-list-002',
      auditCorrelationId: 'audit-list-002',
      payloadHash: 'hash-list-002',
      initialState: 'proposed',
    });

    const actions = listWorkActions({ store });
    expect(actions).toHaveLength(2);
    expect(actions.some((action) => action.actionId === 'action-list-001')).toBe(true);
    expect(actions.some((action) => action.state === 'proposed')).toBe(true);
  });
});

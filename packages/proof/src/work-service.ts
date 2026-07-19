import {
  approveAndDispatchAction,
  evaluateAutonomyCapability,
  type ActionLifecycleStore,
  type ActionRecord,
  type AutonomyTier,
  type ExecuteAuditedActionParams,
  type ExecuteAuditedActionResult,
} from '@semblance/kernel';
import type { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { buildActionReceipt, type ActionReceipt } from './action-receipt.js';

export interface WorkActionView {
  readonly actionId: string;
  readonly requestId: string;
  readonly actionType: string;
  readonly state: ActionRecord['state'];
  readonly capability: string;
  readonly autonomyRationale: string;
  readonly auditCorrelationId: string;
  readonly payloadHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly auditPendingId?: string;
  readonly failureReason?: string;
  readonly reversible?: ActionRecord['reversible'];
}

export interface ListWorkActionsParams {
  readonly store: ActionLifecycleStore;
  readonly limit?: number;
  readonly offset?: number;
  readonly autonomyTier?: AutonomyTier;
}

export interface GetWorkActionReceiptParams {
  readonly store: ActionLifecycleStore;
  readonly auditTrail: AuditTrail;
  readonly actionId: string;
  readonly signingKey: Buffer;
}

function resolveAutonomyRationale(
  record: ActionRecord,
  tier: AutonomyTier,
): string {
  if (record.failureReason) {
    return record.failureReason;
  }
  const evaluation = evaluateAutonomyCapability({
    tier,
    action: record.actionType,
    priorApprovalsForThisCapability: 0,
  });
  return evaluation.reason;
}

export function toWorkActionView(
  record: ActionRecord,
  autonomyTier: AutonomyTier = 'partner',
): WorkActionView {
  return {
    actionId: record.actionId,
    requestId: record.requestId,
    actionType: record.actionType,
    state: record.state,
    capability: record.actionType,
    autonomyRationale: resolveAutonomyRationale(record, autonomyTier),
    auditCorrelationId: record.auditCorrelationId,
    payloadHash: record.payloadHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    auditPendingId: record.auditPendingId,
    failureReason: record.failureReason,
    reversible: record.reversible,
  };
}

export function listWorkActions(params: ListWorkActionsParams): WorkActionView[] {
  const tier = params.autonomyTier ?? 'partner';
  return params.store
    .listRecords(params.limit, params.offset)
    .map((record) => toWorkActionView(record, tier));
}

export function getWorkAction(
  store: ActionLifecycleStore,
  actionId: string,
  autonomyTier: AutonomyTier = 'partner',
): WorkActionView | null {
  const record = store.getRecord(actionId);
  if (!record) {
    return null;
  }
  return toWorkActionView(record, autonomyTier);
}

export async function approveWorkAction(
  params: ExecuteAuditedActionParams & { actionId: string },
): Promise<ExecuteAuditedActionResult> {
  return approveAndDispatchAction(params);
}

export function getActionReceipt(params: GetWorkActionReceiptParams): ActionReceipt {
  const record = params.store.getRecord(params.actionId);
  if (!record) {
    throw new Error(`Action not found: ${params.actionId}`);
  }
  if (record.state !== 'completed') {
    throw new Error(`Action receipt requires completed state, got ${record.state}`);
  }

  const chain = params.auditTrail.verifyChainIntegrity();
  const entries = params.auditTrail.getByRequestId(record.auditCorrelationId);
  const latestEntry = entries.at(-1);
  const auditChainHeadHash = chain.valid && latestEntry
    ? latestEntry.chainHash
    : null;

  return buildActionReceipt({
    record,
    auditChainHeadHash,
    signingKey: params.signingKey,
  });
}

/**
 * Representative email workflow — follow-up detect → style draft → Guardian approval
 * → Gateway send → audited outcome. Injectable deps for tests and bridge IPC.
 */

import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  approveAndDispatchAction,
  createActionLifecycleStore,
  evaluateAutonomyCapability,
  executeAuditedAction,
  isReservationArtifact,
  type ActionLifecycleStore,
  type AutonomyTier,
} from '@semblance/kernel';

export type RepresentativeEmailWorkflowStatus =
  | 'blocked'
  | 'preview'
  | 'requires_approval'
  | 'completed'
  | 'failed';

export interface RepresentativeEmailDraft {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly draftType: string;
  readonly replyToMessageId?: string;
}

export interface FollowUpNeed {
  readonly followUpId: string;
  readonly actionId: string;
  readonly merchantName: string;
  readonly subject: string;
  readonly to: string;
}

export interface DraftEmailRequest {
  readonly to: string;
  readonly subject: string;
  readonly intent: string;
  readonly draftType: string;
  readonly recipientName?: string;
  readonly recipientContext?: string;
  readonly additionalContext?: string;
  readonly replyToMessageId?: string;
}

export interface RepresentativeEmailDrafterPort {
  draftEmail(request: DraftEmailRequest): Promise<RepresentativeEmailDraft>;
}

export interface FollowUpTrackerPort {
  getDueFollowUps(): FollowUpNeed[];
  getFollowUp(id: string): FollowUpNeed | null;
  recordFollowUpSent(id: string): void;
}

export interface EntitlementGatePort {
  readonly mode: 'free' | 'paid' | 'revoked';
  readonly bearer?: string;
  isExecutionAllowed(): boolean;
  isPreviewOnly(): boolean;
  getBlockReason(): string | null;
}

export interface RepresentativeEmailWorkflowRecord {
  readonly workflowId: string;
  readonly followUpId: string;
  readonly actionId: string;
  readonly draft: RepresentativeEmailDraft;
  readonly status: RepresentativeEmailWorkflowStatus;
  readonly auditCorrelationId: string;
  readonly payloadHash: string;
  readonly outcome?: {
    readonly sentAt: string;
    readonly auditRef?: string;
    readonly externalMessageId?: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RepresentativeEmailWorkflowStore {
  save(record: RepresentativeEmailWorkflowRecord): void;
  get(workflowId: string): RepresentativeEmailWorkflowRecord | null;
  getByActionId(actionId: string): RepresentativeEmailWorkflowRecord | null;
  listRecent(limit: number): RepresentativeEmailWorkflowRecord[];
}

export interface RunRepresentativeEmailWorkflowInput {
  readonly followUpId?: string;
  readonly to?: string;
  readonly merchantName?: string;
  readonly subject?: string;
  readonly intent?: string;
  readonly idempotencyKey?: string;
  readonly requestId?: string;
}

export interface RepresentativeEmailWorkflowResult {
  readonly workflowId: string;
  readonly status: RepresentativeEmailWorkflowStatus;
  readonly draft?: RepresentativeEmailDraft;
  readonly actionId?: string;
  readonly auditCorrelationId?: string;
  readonly error?: string;
  readonly preview?: boolean;
  readonly outcome?: RepresentativeEmailWorkflowRecord['outcome'];
}

export interface RepresentativeEmailWorkflowDeps {
  readonly now?: () => Date;
  readonly generateId?: () => string;
  readonly entitlement: EntitlementGatePort;
  readonly followUpTracker: FollowUpTrackerPort;
  readonly emailDrafter: RepresentativeEmailDrafterPort;
  readonly autonomyTier: AutonomyTier;
  readonly actionStore: ActionLifecycleStore;
  readonly workflowStore: RepresentativeEmailWorkflowStore;
  readonly logAuditPending: (params: {
    requestId: string;
    payloadHash: string;
    signature: string;
  }) => string;
  readonly assertAuditPendingBeforeDispatch: (auditPendingId: string, requestId: string) => void;
  readonly executeEmailSend: (payload: {
    to: string[];
    subject: string;
    body: string;
    replyToMessageId?: string;
  }) => Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
}

const CREATE_WORKFLOW_TABLE = `
  CREATE TABLE IF NOT EXISTS representative_email_workflows (
    workflow_id TEXT PRIMARY KEY,
    follow_up_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL,
    audit_correlation_id TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    outcome_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_rep_email_workflow_action
    ON representative_email_workflows(action_id);
`;

interface WorkflowRow {
  workflow_id: string;
  follow_up_id: string;
  action_id: string;
  draft_json: string;
  status: string;
  audit_correlation_id: string;
  payload_hash: string;
  outcome_json: string | null;
  created_at: string;
  updated_at: string;
}

export function hashRepresentativeEmailPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function createEntitlementGateFromSnapshot(input: {
  isPremium: boolean;
  active: boolean;
  bearer?: string;
}): EntitlementGatePort {
  if (input.bearer && isReservationArtifact(input.bearer)) {
    return {
      mode: 'revoked',
      bearer: input.bearer,
      isExecutionAllowed: () => false,
      isPreviewOnly: () => true,
      getBlockReason: () => 'Reservation artifacts never grant paid entitlement',
    };
  }
  if (!input.isPremium || !input.active) {
    return {
      mode: input.isPremium && !input.active ? 'revoked' : 'free',
      bearer: input.bearer,
      isExecutionAllowed: () => false,
      isPreviewOnly: () => true,
      getBlockReason: () =>
        input.isPremium && !input.active
          ? 'Entitlement is revoked or expired'
          : 'Digital Representative execution requires paid entitlement',
    };
  }
  return {
    mode: 'paid',
    bearer: input.bearer,
    isExecutionAllowed: () => true,
    isPreviewOnly: () => false,
    getBlockReason: () => null,
  };
}

export function createRepresentativeEmailWorkflowStore(dbPath: string): RepresentativeEmailWorkflowStore {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(CREATE_WORKFLOW_TABLE);

  const upsert = db.prepare(`
    INSERT INTO representative_email_workflows (
      workflow_id, follow_up_id, action_id, draft_json, status,
      audit_correlation_id, payload_hash, outcome_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workflow_id) DO UPDATE SET
      follow_up_id = excluded.follow_up_id,
      action_id = excluded.action_id,
      draft_json = excluded.draft_json,
      status = excluded.status,
      audit_correlation_id = excluded.audit_correlation_id,
      payload_hash = excluded.payload_hash,
      outcome_json = excluded.outcome_json,
      updated_at = excluded.updated_at
  `);

  const getStmt = db.prepare(
    'SELECT * FROM representative_email_workflows WHERE workflow_id = ?',
  );
  const getByActionStmt = db.prepare(
    'SELECT * FROM representative_email_workflows WHERE action_id = ?',
  );
  const listRecentStmt = db.prepare(
    'SELECT * FROM representative_email_workflows ORDER BY updated_at DESC LIMIT ?',
  );

  function rowToRecord(row: WorkflowRow): RepresentativeEmailWorkflowRecord {
    return {
      workflowId: row.workflow_id,
      followUpId: row.follow_up_id,
      actionId: row.action_id,
      draft: JSON.parse(row.draft_json) as RepresentativeEmailDraft,
      status: row.status as RepresentativeEmailWorkflowStatus,
      auditCorrelationId: row.audit_correlation_id,
      payloadHash: row.payload_hash,
      outcome: row.outcome_json
        ? JSON.parse(row.outcome_json) as RepresentativeEmailWorkflowRecord['outcome']
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    save(record) {
      upsert.run(
        record.workflowId,
        record.followUpId,
        record.actionId,
        JSON.stringify(record.draft),
        record.status,
        record.auditCorrelationId,
        record.payloadHash,
        record.outcome ? JSON.stringify(record.outcome) : null,
        record.createdAt,
        record.updatedAt,
      );
    },
    get(workflowId) {
      const row = getStmt.get(workflowId) as WorkflowRow | undefined;
      return row ? rowToRecord(row) : null;
    },
    getByActionId(actionId) {
      const row = getByActionStmt.get(actionId) as WorkflowRow | undefined;
      return row ? rowToRecord(row) : null;
    },
    listRecent(limit) {
      const rows = listRecentStmt.all(limit) as WorkflowRow[];
      return rows.map(rowToRecord);
    },
  };
}

function resolveFollowUpNeed(
  input: RunRepresentativeEmailWorkflowInput,
  tracker: FollowUpTrackerPort,
): FollowUpNeed | null {
  if (input.followUpId) {
    return tracker.getFollowUp(input.followUpId);
  }
  const due = tracker.getDueFollowUps();
  if (due.length > 0) {
    return due[0] ?? null;
  }
  if (input.to && input.subject) {
    return {
      followUpId: `manual-${randomUUID()}`,
      actionId: `action-${randomUUID()}`,
      merchantName: input.merchantName ?? input.to,
      subject: input.subject,
      to: input.to,
    };
  }
  return null;
}

function buildSendPayload(draft: RepresentativeEmailDraft): {
  to: string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
} {
  return {
    to: [draft.to],
    subject: draft.subject,
    body: draft.body,
    replyToMessageId: draft.replyToMessageId,
  };
}

export async function runRepresentativeEmailWorkflow(
  input: RunRepresentativeEmailWorkflowInput,
  deps: RepresentativeEmailWorkflowDeps,
): Promise<RepresentativeEmailWorkflowResult> {
  const now = deps.now ?? (() => new Date());
  const generateId = deps.generateId ?? (() => randomUUID());

  const blockReason = deps.entitlement.getBlockReason();
  if (blockReason && !deps.entitlement.isPreviewOnly() && !deps.entitlement.isExecutionAllowed()) {
    return {
      workflowId: generateId(),
      status: 'blocked',
      error: blockReason,
    };
  }

  const followUp = resolveFollowUpNeed(input, deps.followUpTracker);
  if (!followUp) {
    return {
      workflowId: generateId(),
      status: 'blocked',
      error: 'No due follow-up found for representative email workflow',
    };
  }

  const draft = await deps.emailDrafter.draftEmail({
    to: followUp.to,
    subject: followUp.subject,
    intent: input.intent ?? `Follow up with ${followUp.merchantName} regarding ${followUp.subject}`,
    draftType: 'follow-up',
    recipientName: followUp.merchantName,
    additionalContext: `Representative follow-up for action ${followUp.actionId}`,
  });

  const workflowId = generateId();
  const requestId = input.requestId ?? `req-rep-email-${workflowId}`;
  const idempotencyKey = input.idempotencyKey ?? `idem-rep-email-${workflowId}`;
  const sendPayload = buildSendPayload(draft);
  const payloadHash = hashRepresentativeEmailPayload(sendPayload);
  const auditCorrelationId = requestId;
  const timestamp = now().toISOString();

  if (deps.entitlement.isPreviewOnly()) {
    const previewRecord: RepresentativeEmailWorkflowRecord = {
      workflowId,
      followUpId: followUp.followUpId,
      actionId: `preview-${workflowId}`,
      draft,
      status: 'preview',
      auditCorrelationId,
      payloadHash,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    deps.workflowStore.save(previewRecord);
    return {
      workflowId,
      status: 'preview',
      draft,
      preview: true,
      auditCorrelationId,
    };
  }

  const autonomy = evaluateAutonomyCapability({
    tier: deps.autonomyTier,
    action: 'email.send',
    destination: draft.to,
    priorApprovalsForThisCapability: 0,
  });

  const lifecycleResult = await executeAuditedAction({
    store: deps.actionStore,
    idempotencyKey,
    requestId,
    actionType: 'email.send',
    payloadHash,
    auditCorrelationId,
    autoApprove: !autonomy.requiresApproval,
    approvalReason: autonomy.reason,
    logAuditPending: () => deps.logAuditPending({
      requestId,
      payloadHash,
      signature: `rep-email:${workflowId}`,
    }),
    assertAuditPendingBeforeDispatch: (auditPendingId: string) => {
      deps.assertAuditPendingBeforeDispatch(auditPendingId, requestId);
    },
    execute: async () => deps.executeEmailSend(sendPayload),
  });

  const workflowRecord: RepresentativeEmailWorkflowRecord = {
    workflowId,
    followUpId: followUp.followUpId,
    actionId: lifecycleResult.record.actionId,
    draft,
    status: lifecycleResult.record.state === 'completed'
      ? 'completed'
      : lifecycleResult.execution.error?.code === 'REQUIRES_APPROVAL'
        ? 'requires_approval'
        : lifecycleResult.execution.success
          ? 'completed'
          : 'failed',
    auditCorrelationId,
    payloadHash,
    createdAt: timestamp,
    updatedAt: lifecycleResult.record.updatedAt,
  };
  deps.workflowStore.save(workflowRecord);

  if (lifecycleResult.execution.error?.code === 'REQUIRES_APPROVAL') {
    return {
      workflowId,
      status: 'requires_approval',
      draft,
      actionId: lifecycleResult.record.actionId,
      auditCorrelationId,
    };
  }

  if (lifecycleResult.record.state === 'completed') {
    deps.followUpTracker.recordFollowUpSent(followUp.followUpId);
    const outcome = {
      sentAt: lifecycleResult.record.updatedAt,
      externalMessageId:
        typeof lifecycleResult.execution.data === 'object'
        && lifecycleResult.execution.data !== null
        && 'messageId' in (lifecycleResult.execution.data as Record<string, unknown>)
          ? String((lifecycleResult.execution.data as Record<string, unknown>).messageId)
          : undefined,
    };
    deps.workflowStore.save({
      ...workflowRecord,
      status: 'completed',
      outcome,
      updatedAt: lifecycleResult.record.updatedAt,
    });
    return {
      workflowId,
      status: 'completed',
      draft,
      actionId: lifecycleResult.record.actionId,
      auditCorrelationId,
      outcome,
    };
  }

  return {
    workflowId,
    status: 'failed',
    draft,
    actionId: lifecycleResult.record.actionId,
    auditCorrelationId,
    error: lifecycleResult.execution.error?.message ?? 'Representative email workflow failed',
  };
}

export async function approveRepresentativeEmailWorkflow(
  workflowId: string,
  deps: RepresentativeEmailWorkflowDeps,
): Promise<RepresentativeEmailWorkflowResult> {
  if (!deps.entitlement.isExecutionAllowed()) {
    return {
      workflowId,
      status: 'blocked',
      error: deps.entitlement.getBlockReason() ?? 'Entitlement does not allow execution',
    };
  }

  const workflow = deps.workflowStore.get(workflowId);
  if (!workflow) {
    return {
      workflowId,
      status: 'blocked',
      error: `Workflow not found: ${workflowId}`,
    };
  }

  if (workflow.status === 'completed') {
    return {
      workflowId,
      status: 'completed',
      draft: workflow.draft,
      actionId: workflow.actionId,
      auditCorrelationId: workflow.auditCorrelationId,
      outcome: workflow.outcome,
    };
  }

  if (workflow.status !== 'requires_approval') {
    return {
      workflowId,
      status: 'blocked',
      error: `Workflow ${workflowId} is not awaiting approval (status=${workflow.status})`,
    };
  }

  const sendPayload = buildSendPayload(workflow.draft);
  const actionRecord = deps.actionStore.getRecord(workflow.actionId);
  if (!actionRecord) {
    return {
      workflowId,
      status: 'blocked',
      error: `Action record not found: ${workflow.actionId}`,
    };
  }

  const dispatchResult = await approveAndDispatchAction({
    store: deps.actionStore,
    actionId: workflow.actionId,
    idempotencyKey: actionRecord.idempotencyKey,
    requestId: actionRecord.requestId,
    actionType: 'email.send',
    payloadHash: workflow.payloadHash,
    auditCorrelationId: workflow.auditCorrelationId,
    logAuditPending: () => deps.logAuditPending({
      requestId: workflow.auditCorrelationId,
      payloadHash: workflow.payloadHash,
      signature: `rep-email-approve:${workflowId}`,
    }),
    assertAuditPendingBeforeDispatch: (auditPendingId: string) => {
      deps.assertAuditPendingBeforeDispatch(auditPendingId, workflow.auditCorrelationId);
    },
    execute: async () => deps.executeEmailSend(sendPayload),
  });

  if (dispatchResult.record.state !== 'completed') {
    deps.workflowStore.save({
      ...workflow,
      status: 'failed',
      updatedAt: dispatchResult.record.updatedAt,
    });
    return {
      workflowId,
      status: 'failed',
      draft: workflow.draft,
      actionId: workflow.actionId,
      auditCorrelationId: workflow.auditCorrelationId,
      error: dispatchResult.execution.error?.message ?? 'Approval dispatch failed',
    };
  }

  deps.followUpTracker.recordFollowUpSent(workflow.followUpId);
  const outcome = {
    sentAt: dispatchResult.record.updatedAt,
    externalMessageId:
      typeof dispatchResult.execution.data === 'object'
      && dispatchResult.execution.data !== null
      && 'messageId' in (dispatchResult.execution.data as Record<string, unknown>)
        ? String((dispatchResult.execution.data as Record<string, unknown>).messageId)
        : undefined,
  };

  deps.workflowStore.save({
    ...workflow,
    status: 'completed',
    outcome,
    updatedAt: dispatchResult.record.updatedAt,
  });

  return {
    workflowId,
    status: 'completed',
    draft: workflow.draft,
    actionId: workflow.actionId,
    auditCorrelationId: workflow.auditCorrelationId,
    outcome,
  };
}

export function reopenRepresentativeEmailWorkflowStores(
  actionsDbPath: string,
): {
  actionStore: ActionLifecycleStore;
  workflowStore: RepresentativeEmailWorkflowStore;
} {
  const actionDb = new Database(actionsDbPath);
  return {
    actionStore: createActionLifecycleStore(actionDb),
    workflowStore: createRepresentativeEmailWorkflowStore(actionsDbPath),
  };
}

export function getRepresentativeEmailWorkflowAuditRecord(
  store: ActionLifecycleStore,
  actionId: string,
): ReturnType<ActionLifecycleStore['getRecord']> {
  return store.getRecord(actionId);
}

export function isRepresentativeEmailWorkflowRestartPersistent(
  before: RepresentativeEmailWorkflowRecord | null,
  after: RepresentativeEmailWorkflowRecord | null,
): boolean {
  if (!before || !after) {
    return false;
  }
  return (
    before.workflowId === after.workflowId
    && before.actionId === after.actionId
    && before.status === after.status
    && before.payloadHash === after.payloadHash
  );
}

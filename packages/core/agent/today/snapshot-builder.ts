import type { ActionLifecycleStore } from '@semblance/kernel';
import type { AuditTrail } from '@semblance/gateway/audit/trail.js';
import type { DatabaseHandle } from '../../platform/types.js';
import type { ProactiveEngine } from '../proactive-engine.js';
import type { IntentManager } from '../intent-manager.js';
import type { RepresentativeEmailWorkflowStore } from '../representative-email-workflow.js';
import type {
  TodayCompletedAction,
  TodayDocumentChange,
  TodayInboxReplyItem,
  TodayInboxStrip,
  TodayInboxTriageItem,
  TodayMeasuredOutcome,
  TodayPendingDecision,
  TodayProvenanceSummary,
  TodayRepresentativeActionItem,
  TodayRisk,
  TodaySnapshot,
} from './types.js';

const RECENT_CHANGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const COMPLETED_ACTION_LIMIT = 20;
const RISK_LIMIT = 20;
const INBOX_LIMIT = 10;

export interface TodaySnapshotDeps {
  readonly prefsDb: DatabaseHandle | null;
  readonly documentsDb: DatabaseHandle | null;
  readonly actionLifecycleStore: ActionLifecycleStore | null;
  readonly auditTrail: AuditTrail | null;
  readonly proactiveEngine: ProactiveEngine | null;
  readonly intentManager: IntentManager | null;
  readonly representativeWorkflowStore: RepresentativeEmailWorkflowStore | null;
  readonly now?: () => Date;
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function gatherDocumentChanges(deps: TodaySnapshotDeps, now: Date): TodayDocumentChange[] {
  if (!deps.documentsDb) return [];

  try {
    const cutoff = new Date(now.getTime() - RECENT_CHANGE_WINDOW_MS).toISOString();
    const rows = deps.documentsDb.prepare(
      `SELECT id, title, source, source_path, updated_at, indexed_at
       FROM documents
       WHERE updated_at >= ? OR indexed_at >= ?
       ORDER BY updated_at DESC
       LIMIT 20`,
    ).all(cutoff, cutoff) as Array<{
      id: string;
      title: string;
      source: string;
      source_path: string | null;
      updated_at: string;
      indexed_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      source: row.source,
      sourcePath: row.source_path,
      updatedAt: row.updated_at,
      changeType: row.updated_at === row.indexed_at ? 'indexed' : 'updated',
    }));
  } catch {
    return [];
  }
}

function gatherRisks(deps: TodaySnapshotDeps): TodayRisk[] {
  const risks: TodayRisk[] = [];

  if (deps.prefsDb) {
    try {
      const pending = deps.prefsDb.prepare(
        "SELECT id, action, reasoning, domain, created_at FROM pending_actions WHERE status = 'pending_approval' ORDER BY created_at DESC LIMIT ?",
      ).all(RISK_LIMIT) as Array<{
        id: string;
        action: string;
        reasoning: string;
        domain: string;
        created_at: string;
      }>;

      for (const row of pending) {
        risks.push({
          id: row.id,
          kind: 'pending_approval',
          title: row.action,
          description: row.reasoning || 'Awaiting your approval',
          domain: row.domain || 'general',
          severity: 'high',
          source: 'pending_actions',
          createdAt: row.created_at,
        });
      }
    } catch {
      // pending_actions may not exist
    }
  }

  if (deps.actionLifecycleStore) {
    try {
      const records = deps.actionLifecycleStore.listRecords(RISK_LIMIT, 0);
      for (const record of records) {
        if (record.state === 'proposed' || record.state === 'failed') {
          risks.push({
            id: record.actionId,
            kind: record.state === 'failed' ? 'failed_action' : 'proposed_action',
            title: record.actionType,
            description: record.failureReason ?? 'Action requires attention',
            domain: record.actionType.split('.')[0] ?? 'general',
            severity: record.state === 'failed' ? 'high' : 'medium',
            source: 'action_lifecycle',
            createdAt: record.createdAt,
          });
        }
      }
    } catch {
      // action lifecycle may not be initialized
    }
  }

  if (deps.proactiveEngine) {
    try {
      const insights = deps.proactiveEngine.getActiveInsights();
      for (const insight of insights.filter(i => i.priority === 'high').slice(0, 5)) {
        risks.push({
          id: insight.id,
          kind: 'proactive_insight',
          title: insight.title,
          description: insight.summary,
          domain: insight.type,
          severity: 'medium',
          source: 'proactive_engine',
          createdAt: insight.createdAt,
        });
      }
    } catch {
      // proactive engine may not have data
    }
  }

  return risks.slice(0, RISK_LIMIT);
}

function gatherCompletedActions(deps: TodaySnapshotDeps, now: Date): TodayCompletedAction[] {
  const completed: TodayCompletedAction[] = [];
  const todayStart = startOfDay(now).toISOString();

  if (deps.actionLifecycleStore) {
    try {
      const records = deps.actionLifecycleStore.listRecords(COMPLETED_ACTION_LIMIT, 0);
      for (const record of records) {
        if (record.state !== 'completed') continue;
        if (record.updatedAt < todayStart) continue;
        completed.push({
          id: record.actionId,
          actionType: record.actionType,
          description: record.actionType,
          completedAt: record.updatedAt,
          estimatedTimeSavedSeconds: 0,
          auditRef: record.auditCorrelationId,
          source: 'action_lifecycle',
        });
      }
    } catch {
      // action lifecycle may not be initialized
    }
  }

  if (deps.auditTrail) {
    try {
      const entries = deps.auditTrail.getRecent(COMPLETED_ACTION_LIMIT);
      for (const entry of entries) {
        if (entry.direction !== 'response' || entry.status !== 'success') continue;
        if (entry.timestamp < todayStart) continue;
        if (completed.some(c => c.auditRef === entry.requestId)) continue;
        completed.push({
          id: entry.id,
          actionType: entry.action,
          description: entry.action,
          completedAt: entry.timestamp,
          estimatedTimeSavedSeconds: entry.estimatedTimeSavedSeconds ?? 0,
          auditRef: entry.requestId,
          source: 'audit_trail',
        });
      }
    } catch {
      // audit trail may not be initialized
    }
  }

  if (deps.prefsDb) {
    try {
      const rows = deps.prefsDb.prepare(
        "SELECT id, action, created_at, response_json FROM pending_actions WHERE status = 'executed' AND created_at >= ? ORDER BY created_at DESC LIMIT ?",
      ).all(todayStart, COMPLETED_ACTION_LIMIT) as Array<{
        id: string;
        action: string;
        created_at: string;
        response_json: string | null;
      }>;

      for (const row of rows) {
        if (completed.some(c => c.id === row.id)) continue;
        completed.push({
          id: row.id,
          actionType: row.action,
          description: row.action,
          completedAt: row.created_at,
          estimatedTimeSavedSeconds: 0,
          auditRef: null,
          source: 'pending_actions',
        });
      }
    } catch {
      // pending_actions may not exist
    }
  }

  return completed
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, COMPLETED_ACTION_LIMIT);
}

function gatherPendingDecisions(deps: TodaySnapshotDeps): TodayPendingDecision[] {
  const decisions: TodayPendingDecision[] = [];

  if (deps.prefsDb) {
    try {
      const pending = deps.prefsDb.prepare(
        "SELECT id, action, reasoning, domain, created_at FROM pending_actions WHERE status = 'pending_approval' ORDER BY created_at DESC LIMIT ?",
      ).all(RISK_LIMIT) as Array<{
        id: string;
        action: string;
        reasoning: string;
        domain: string;
        created_at: string;
      }>;

      for (const row of pending) {
        decisions.push({
          id: row.id,
          kind: 'approval',
          title: row.action,
          description: row.reasoning || 'Approval required',
          domain: row.domain || 'general',
          createdAt: row.created_at,
          source: 'pending_actions',
        });
      }
    } catch {
      // pending_actions may not exist
    }
  }

  if (deps.intentManager) {
    try {
      const observations = deps.intentManager.getPendingObservations('chat');
      for (const obs of observations.slice(0, 5)) {
        decisions.push({
          id: obs.id,
          kind: 'intent_observation',
          title: obs.type,
          description: obs.description,
          domain: 'intent',
          createdAt: obs.createdAt,
          source: 'intent_manager',
        });
      }
    } catch {
      // intent manager may not be initialized
    }
  }

  if (deps.representativeWorkflowStore) {
    try {
      const workflows = deps.representativeWorkflowStore.listRecent(INBOX_LIMIT);
      for (const workflow of workflows.filter(w => w.status === 'requires_approval' || w.status === 'preview')) {
        decisions.push({
          id: workflow.workflowId,
          kind: 'workflow',
          title: workflow.draft.subject,
          description: `Representative email workflow (${workflow.status})`,
          domain: 'email',
          createdAt: workflow.createdAt,
          source: 'representative_email_workflow',
        });
      }
    } catch {
      // workflow store may not be initialized
    }
  }

  return decisions.slice(0, RISK_LIMIT);
}

function gatherMeasuredOutcomes(deps: TodaySnapshotDeps, now: Date): TodayMeasuredOutcome[] {
  const outcomes: TodayMeasuredOutcome[] = [];
  const todayStart = startOfDay(now).toISOString();

  if (deps.auditTrail) {
    try {
      const entries = deps.auditTrail.getRecent(50);
      for (const entry of entries) {
        if ((entry.estimatedTimeSavedSeconds ?? 0) <= 0) continue;
        if (entry.timestamp < todayStart) continue;
        outcomes.push({
          id: entry.id,
          title: entry.action,
          measuredAt: entry.timestamp,
          timeSavedSeconds: entry.estimatedTimeSavedSeconds ?? 0,
          source: 'audit_trail',
          auditRef: entry.requestId,
        });
      }
    } catch {
      // audit trail may not be initialized
    }
  }

  if (deps.representativeWorkflowStore) {
    try {
      const workflows = deps.representativeWorkflowStore.listRecent(INBOX_LIMIT);
      for (const workflow of workflows) {
        if (!workflow.outcome) continue;
        outcomes.push({
          id: workflow.workflowId,
          title: workflow.draft.subject,
          measuredAt: workflow.outcome.sentAt,
          timeSavedSeconds: 0,
          source: 'representative_email_workflow',
          auditRef: workflow.auditCorrelationId,
        });
      }
    } catch {
      // workflow store may not be initialized
    }
  }

  return outcomes.slice(0, COMPLETED_ACTION_LIMIT);
}

function gatherProvenance(deps: TodaySnapshotDeps): TodayProvenanceSummary {
  const documentCountBySource: Record<string, number> = {};
  let totalDocuments = 0;
  let lastIndexedAt: string | null = null;
  const connectedSources: string[] = [];

  if (deps.documentsDb) {
    try {
      const counts = deps.documentsDb.prepare(
        'SELECT source, COUNT(*) as count FROM documents GROUP BY source',
      ).all() as Array<{ source: string; count: number }>;

      for (const row of counts) {
        documentCountBySource[row.source] = row.count;
        totalDocuments += row.count;
        if (row.count > 0) connectedSources.push(row.source);
      }

      const latest = deps.documentsDb.prepare(
        'SELECT indexed_at FROM documents ORDER BY indexed_at DESC LIMIT 1',
      ).get() as { indexed_at: string } | undefined;
      lastIndexedAt = latest?.indexed_at ?? null;
    } catch {
      // documents table may not exist
    }
  }

  let auditChainValid: boolean | null = null;
  if (deps.auditTrail) {
    try {
      auditChainValid = deps.auditTrail.verifyChainIntegrity().valid;
    } catch {
      auditChainValid = null;
    }
  }

  return {
    documentCountBySource,
    totalDocuments,
    lastIndexedAt,
    auditChainValid,
    connectedSources,
  };
}

function gatherInboxStrip(deps: TodaySnapshotDeps): TodayInboxStrip {
  const triage: TodayInboxTriageItem[] = [];
  const pendingReplies: TodayInboxReplyItem[] = [];
  const representativeActions: TodayRepresentativeActionItem[] = [];

  if (deps.proactiveEngine) {
    try {
      const insights = deps.proactiveEngine.getActiveInsights();
      for (const insight of insights.filter(i => i.type === 'follow_up').slice(0, INBOX_LIMIT)) {
        triage.push({
          id: insight.id,
          title: insight.title,
          summary: insight.summary,
          priority: insight.priority === 'high' ? 'high' : insight.priority === 'low' ? 'low' : 'medium',
          source: 'proactive_engine',
          createdAt: insight.createdAt,
        });
      }
    } catch {
      // proactive engine may not have data
    }
  }

  if (deps.prefsDb) {
    try {
      const rows = deps.prefsDb.prepare(
        `SELECT id, subject, "from", snippet, received_at, priority
         FROM indexed_emails
         WHERE folder = 'INBOX' AND is_read = 0
         ORDER BY received_at DESC
         LIMIT ?`,
      ).all(INBOX_LIMIT) as Array<{
        id: string;
        subject: string;
        from: string;
        snippet: string;
        received_at: string;
        priority: string;
      }>;

      for (const row of rows) {
        pendingReplies.push({
          id: row.id,
          subject: row.subject,
          from: row.from,
          snippet: row.snippet,
          receivedAt: row.received_at,
          priority: row.priority === 'high' ? 'high' : row.priority === 'low' ? 'low' : 'normal',
        });
      }
    } catch {
      // indexed_emails may not exist
    }
  }

  if (deps.representativeWorkflowStore) {
    try {
      const workflows = deps.representativeWorkflowStore.listRecent(INBOX_LIMIT);
      for (const workflow of workflows) {
        representativeActions.push({
          id: workflow.workflowId,
          subject: workflow.draft.subject,
          status: workflow.status,
          updatedAt: workflow.updatedAt,
          source: 'representative_email_workflow',
        });
      }
    } catch {
      // workflow store may not be initialized
    }
  }

  return { triage, pendingReplies, representativeActions };
}

function computeIsEmpty(snapshot: Omit<TodaySnapshot, 'isEmpty'>): boolean {
  return snapshot.changes.length === 0
    && snapshot.risks.length === 0
    && snapshot.completedActions.length === 0
    && snapshot.pendingDecisions.length === 0
    && snapshot.outcomes.length === 0
    && snapshot.inbox.triage.length === 0
    && snapshot.inbox.pendingReplies.length === 0
    && snapshot.inbox.representativeActions.length === 0;
}

export function buildTodaySnapshot(deps: TodaySnapshotDeps): TodaySnapshot {
  const now = deps.now?.() ?? new Date();
  const date = now.toISOString().slice(0, 10);

  const changes = gatherDocumentChanges(deps, now);
  const risks = gatherRisks(deps);
  const completedActions = gatherCompletedActions(deps, now);
  const pendingDecisions = gatherPendingDecisions(deps);
  const outcomes = gatherMeasuredOutcomes(deps, now);
  const provenance = gatherProvenance(deps);
  const inbox = gatherInboxStrip(deps);

  const partial: Omit<TodaySnapshot, 'isEmpty'> = {
    assembledAt: now.toISOString(),
    date,
    changes,
    risks,
    completedActions,
    pendingDecisions,
    outcomes,
    provenance,
    inbox,
  };

  return {
    ...partial,
    isEmpty: computeIsEmpty(partial),
  };
}

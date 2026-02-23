// Representative Action Manager — Autonomy-aware approval and execution of
// Digital Representative actions. Implements 3-level classification on top
// of the existing autonomy framework.
//
// Classification matrix:
//   routine   (confirmations, simple replies)  → Guardian: approval, Partner: auto, Alter Ego: auto
//   standard  (cancellations, customer service) → Guardian: approval, Partner: approval, Alter Ego: auto
//   high-stakes (disputes, escalations, legal)  → Guardian: approval, Partner: approval, Alter Ego: approval
//
// CRITICAL: This file is in packages/core/. No network imports.
// Email sending goes via IPCClient, which handles signing and audit trail.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { IPCClient } from '../agent/ipc-client.js';
import type { AutonomyManager } from '../agent/autonomy.js';
import type { PremiumGate, PremiumFeature } from '../premium/premium-gate.js';
import type { FollowUpTracker } from './follow-up-tracker.js';
import type {
  RepresentativeDraft,
  RepresentativeAction,
  RepresentativeActionClassification,
} from './types.js';
import type { AutonomyTier } from '../agent/types.js';

// ─── Classification Rules ────────────────────────────────────────────────────

const DRAFT_TYPE_CLASSIFICATION: Record<string, RepresentativeActionClassification> = {
  'confirmation': 'routine',
  'follow-up': 'routine',
  'general': 'routine',
  'inquiry': 'standard',
  'cancellation': 'standard',
  'billing': 'standard',
  'refund': 'standard',
  'warranty': 'standard',
  'escalation': 'high-stakes',
};

// Auto-approve matrix: [tier][classification] → boolean
const AUTO_APPROVE: Record<AutonomyTier, Record<RepresentativeActionClassification, boolean>> = {
  guardian: { routine: false, standard: false, 'high-stakes': false },
  partner: { routine: true, standard: false, 'high-stakes': false },
  alter_ego: { routine: true, standard: true, 'high-stakes': false },
};

// ─── SQLite Schema ───────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS representative_actions (
    id TEXT PRIMARY KEY,
    draft_json TEXT NOT NULL,
    classification TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reasoning TEXT NOT NULL DEFAULT '',
    audit_ref TEXT,
    estimated_time_saved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_rep_action_status ON representative_actions(status);
`;

interface ActionRow {
  id: string;
  draft_json: string;
  classification: string;
  status: string;
  reasoning: string;
  audit_ref: string | null;
  estimated_time_saved: number;
  created_at: string;
  resolved_at: string | null;
}

function rowToAction(row: ActionRow): RepresentativeAction {
  return {
    id: row.id,
    draft: JSON.parse(row.draft_json) as RepresentativeDraft,
    classification: row.classification as RepresentativeActionClassification,
    status: row.status as RepresentativeAction['status'],
    reasoning: row.reasoning,
    auditRef: row.audit_ref,
    estimatedTimeSavedSeconds: row.estimated_time_saved,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// ─── Time Saved Estimates ────────────────────────────────────────────────────

const TIME_SAVED_BY_TYPE: Record<string, number> = {
  cancellation: 900,    // 15 min — finding support, writing, waiting
  refund: 600,          // 10 min
  billing: 300,         // 5 min
  inquiry: 180,         // 3 min
  escalation: 1200,     // 20 min
  warranty: 600,        // 10 min
  'follow-up': 120,     // 2 min
  confirmation: 60,     // 1 min
  general: 180,         // 3 min
};

// ─── Action Manager ──────────────────────────────────────────────────────────

export class RepresentativeActionManager {
  private db: DatabaseHandle;
  private ipcClient: IPCClient;
  private autonomyManager: AutonomyManager;
  private premiumGate: PremiumGate;
  private followUpTracker: FollowUpTracker;

  constructor(config: {
    db: DatabaseHandle;
    ipcClient: IPCClient;
    autonomyManager: AutonomyManager;
    premiumGate: PremiumGate;
    followUpTracker: FollowUpTracker;
  }) {
    this.db = config.db;
    this.ipcClient = config.ipcClient;
    this.autonomyManager = config.autonomyManager;
    this.premiumGate = config.premiumGate;
    this.followUpTracker = config.followUpTracker;
    this.db.exec(CREATE_TABLE);
  }

  /**
   * Classify an action based on draft type.
   */
  classifyAction(draft: RepresentativeDraft): RepresentativeActionClassification {
    return DRAFT_TYPE_CLASSIFICATION[draft.draftType] ?? 'standard';
  }

  /**
   * Submit an action for approval or auto-execution.
   * Checks premium gate, reads autonomy tier, and decides whether to auto-send.
   */
  async submitAction(
    draft: RepresentativeDraft,
    reasoning: string = '',
  ): Promise<RepresentativeAction> {
    // Check premium gate
    if (!this.premiumGate.isFeatureAvailable('representative-drafting' as PremiumFeature)) {
      const action = this.storeAction(draft, 'pending', reasoning);
      return action;
    }

    const classification = this.classifyAction(draft);
    const tier = this.autonomyManager.getDomainTier('email');
    const shouldAutoApprove = AUTO_APPROVE[tier][classification];

    if (shouldAutoApprove) {
      // Auto-send via IPC
      const response = await this.ipcClient.sendAction('email.send', {
        to: [draft.to],
        subject: draft.subject,
        body: draft.body,
        replyToMessageId: draft.replyToMessageId,
      });

      const action = this.storeAction(draft, 'sent', reasoning, response.auditRef);

      // Create follow-up tracker entry
      this.followUpTracker.createFollowUp(
        action.id,
        extractMerchant(draft.subject),
        draft.subject,
      );

      return action;
    }

    // Queue for approval
    return this.storeAction(draft, 'pending', reasoning);
  }

  /**
   * Approve a pending action — sends it via IPC.
   */
  async approveAction(actionId: string): Promise<RepresentativeAction | null> {
    const action = this.getAction(actionId);
    if (!action || action.status !== 'pending') return null;

    const response = await this.ipcClient.sendAction('email.send', {
      to: [action.draft.to],
      subject: action.draft.subject,
      body: action.draft.body,
      replyToMessageId: action.draft.replyToMessageId,
    });

    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE representative_actions SET status = ?, audit_ref = ?, resolved_at = ? WHERE id = ?'
    ).run('sent', response.auditRef, now, actionId);

    // Create follow-up tracker entry
    this.followUpTracker.createFollowUp(
      actionId,
      extractMerchant(action.draft.subject),
      action.draft.subject,
    );

    return this.getAction(actionId);
  }

  /**
   * Reject a pending action.
   */
  rejectAction(actionId: string): RepresentativeAction | null {
    const action = this.getAction(actionId);
    if (!action || action.status !== 'pending') return null;

    const now = new Date().toISOString();
    this.db.prepare(
      'UPDATE representative_actions SET status = ?, resolved_at = ? WHERE id = ?'
    ).run('rejected', now, actionId);

    return this.getAction(actionId);
  }

  /**
   * Get all pending actions.
   */
  getPendingActions(): RepresentativeAction[] {
    const rows = this.db.prepare(
      'SELECT * FROM representative_actions WHERE status = ? ORDER BY created_at DESC'
    ).all('pending') as ActionRow[];
    return rows.map(rowToAction);
  }

  /**
   * Get recent action history.
   */
  getActionHistory(limit: number = 20): RepresentativeAction[] {
    const rows = this.db.prepare(
      'SELECT * FROM representative_actions ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as ActionRow[];
    return rows.map(rowToAction);
  }

  /**
   * Get a specific action by ID.
   */
  getAction(id: string): RepresentativeAction | null {
    const row = this.db.prepare(
      'SELECT * FROM representative_actions WHERE id = ?'
    ).get(id) as ActionRow | undefined;
    return row ? rowToAction(row) : null;
  }

  private storeAction(
    draft: RepresentativeDraft,
    status: RepresentativeAction['status'],
    reasoning: string,
    auditRef?: string,
  ): RepresentativeAction {
    const id = `ra_${nanoid()}`;
    const now = new Date().toISOString();
    const timeSaved = TIME_SAVED_BY_TYPE[draft.draftType] ?? 180;
    const resolvedAt = status === 'sent' ? now : null;

    this.db.prepare(`
      INSERT INTO representative_actions
        (id, draft_json, classification, status, reasoning, audit_ref, estimated_time_saved, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      JSON.stringify(draft),
      this.classifyAction(draft),
      status,
      reasoning,
      auditRef ?? null,
      timeSaved,
      now,
      resolvedAt,
    );

    return {
      id,
      draft,
      classification: this.classifyAction(draft),
      status,
      reasoning,
      auditRef: auditRef ?? null,
      estimatedTimeSavedSeconds: timeSaved,
      createdAt: now,
      resolvedAt,
    };
  }
}

function extractMerchant(subject: string): string {
  // Extract merchant name from subject like "Cancel Subscription — Netflix"
  const match = subject.match(/—\s*(.+)$/);
  return match?.[1]?.trim() ?? subject;
}

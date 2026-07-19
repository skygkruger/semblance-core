/**
 * Outcome Linker — Closes insight → recommendation → action → external effect → outcome.
 *
 * Learning occurs ONLY when an outcome is measured or user-confirmed.
 * Trust-ladder hooks are capability-scoped — success in one domain never
 * grants privilege in another.
 *
 * CRITICAL: No network imports.
 */

import { join } from 'node:path';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { DatabaseHandle } from '../../platform/types.js';
import {
  capabilityEscalationWouldHelp,
  isCapabilityScopedAction,
} from '../autonomy-capability-evaluator.js';
import type { ApprovalPatternTracker } from '../approval-patterns.js';
import type { EscalationEngine } from '../autonomy-escalation.js';
import type { ProactiveInsight, SuggestedAction } from '../proactive-engine.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OutcomeLinkStatus = 'open' | 'completed' | 'speculative';

export interface OutcomeLink {
  readonly id: string;
  readonly capability: string;
  readonly insightId: string | null;
  readonly recommendationId: string | null;
  readonly actionId: string | null;
  readonly externalEffectId: string | null;
  readonly actionType: string | null;
  readonly insightType: string | null;
  readonly status: OutcomeLinkStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecordOutcomeInput {
  readonly linkId: string;
  readonly value: unknown;
  readonly measured?: boolean;
  readonly userConfirmed?: boolean;
}

export interface RecordOutcomeResult {
  readonly accepted: boolean;
  readonly learned: boolean;
  readonly reason: string;
  readonly link: OutcomeLink | null;
  readonly escalationEligible: boolean;
}

export interface OutcomeLinkerHooks {
  readonly approvalPatterns?: ApprovalPatternTracker;
  readonly escalationEngine?: EscalationEngine;
}

const ACTION_TO_CAPABILITY: Record<string, string> = {
  'email.fetch': 'email',
  'email.send': 'email',
  'email.draft': 'email',
  'email.archive': 'email',
  'finance.fetch_transactions': 'finance',
  'finance.plaid_sync': 'finance',
  'calendar.fetch': 'calendar',
  'calendar.create': 'calendar',
  'health.fetch': 'health',
  'web.search': 'web',
  'service.api_call': 'services',
};

function resolveCapability(actionType: string | null | undefined, insightType?: string | null): string {
  if (actionType && ACTION_TO_CAPABILITY[actionType]) {
    return ACTION_TO_CAPABILITY[actionType]!;
  }
  if (insightType?.includes('finance') || insightType?.includes('subscription')) return 'finance';
  if (insightType?.includes('form')) return 'forms';
  if (insightType?.includes('health') || insightType?.includes('wellness')) return 'health';
  if (insightType?.includes('defense') || insightType?.includes('dark')) return 'defense';
  if (insightType?.includes('digest')) return 'digest';
  if (insightType?.includes('alter')) return 'alter-ego';
  if (insightType?.includes('relationship')) return 'relationships';
  if (insightType?.includes('follow') || insightType?.includes('representative')) return 'representative';
  return 'general';
}

// ─── SQLite Schema ───────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS proactive_outcome_links (
    id TEXT PRIMARY KEY,
    capability TEXT NOT NULL,
    insight_id TEXT,
    recommendation_id TEXT,
    action_id TEXT,
    external_effect_id TEXT,
    action_type TEXT,
    insight_type TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    outcome_json TEXT,
    learned INTEGER NOT NULL DEFAULT 0,
    measured INTEGER NOT NULL DEFAULT 0,
    user_confirmed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_outcome_links_capability ON proactive_outcome_links(capability);
  CREATE INDEX IF NOT EXISTS idx_outcome_links_insight ON proactive_outcome_links(insight_id);
  CREATE INDEX IF NOT EXISTS idx_outcome_links_status ON proactive_outcome_links(status);
  CREATE INDEX IF NOT EXISTS idx_outcome_links_updated ON proactive_outcome_links(updated_at DESC);
`;

interface LinkRow {
  id: string;
  capability: string;
  insight_id: string | null;
  recommendation_id: string | null;
  action_id: string | null;
  external_effect_id: string | null;
  action_type: string | null;
  insight_type: string | null;
  status: string;
  outcome_json: string | null;
  learned: number;
  measured: number;
  user_confirmed: number;
  created_at: string;
  updated_at: string;
}

function rowToLink(row: LinkRow): OutcomeLink {
  return {
    id: row.id,
    capability: row.capability,
    insightId: row.insight_id,
    recommendationId: row.recommendation_id,
    actionId: row.action_id,
    externalEffectId: row.external_effect_id,
    actionType: row.action_type,
    insightType: row.insight_type,
    status: row.status as OutcomeLinkStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Outcome Linker ──────────────────────────────────────────────────────────

export interface OutcomeLinker {
  createLinkFromInsight(insight: ProactiveInsight): OutcomeLink;
  attachRecommendation(linkId: string, recommendationId: string): OutcomeLink | null;
  attachAction(linkId: string, actionId: string, actionType: string): OutcomeLink | null;
  attachExternalEffect(linkId: string, externalEffectId: string): OutcomeLink | null;
  recordOutcome(input: RecordOutcomeInput): RecordOutcomeResult;
  getLink(linkId: string): OutcomeLink | null;
  listRecent(limit?: number): OutcomeLink[];
  listLearnedOutcomes(limit?: number): Array<OutcomeLink & { value: unknown }>;
}

function buildOutcomeLinker(
  db: Database.Database,
  hooks: OutcomeLinkerHooks,
): OutcomeLinker {
  db.exec(CREATE_TABLE);

  const insertLink = db.prepare(`
    INSERT INTO proactive_outcome_links (
      id, capability, insight_id, recommendation_id, action_id, external_effect_id,
      action_type, insight_type, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateLink = db.prepare(`
    UPDATE proactive_outcome_links
    SET recommendation_id = COALESCE(?, recommendation_id),
        action_id = COALESCE(?, action_id),
        external_effect_id = COALESCE(?, external_effect_id),
        action_type = COALESCE(?, action_type),
        status = COALESCE(?, status),
        outcome_json = COALESCE(?, outcome_json),
        learned = COALESCE(?, learned),
        measured = COALESCE(?, measured),
        user_confirmed = COALESCE(?, user_confirmed),
        updated_at = ?
    WHERE id = ?
  `);

  const getLinkStmt = db.prepare('SELECT * FROM proactive_outcome_links WHERE id = ?');
  const listRecentStmt = db.prepare(
    'SELECT * FROM proactive_outcome_links ORDER BY updated_at DESC LIMIT ?',
  );
  const listLearnedStmt = db.prepare(
    'SELECT * FROM proactive_outcome_links WHERE learned = 1 ORDER BY updated_at DESC LIMIT ?',
  );

  function readLink(linkId: string): OutcomeLink | null {
    const row = getLinkStmt.get(linkId) as LinkRow | undefined;
    return row ? rowToLink(row) : null;
  }

  function maybeFeedTrustLadder(link: OutcomeLink, actionType: string | null): boolean {
    if (!actionType || !isCapabilityScopedAction(actionType)) {
      return false;
    }
    if (!hooks.approvalPatterns || !hooks.escalationEngine) {
      return capabilityEscalationWouldHelp(actionType, 1);
    }

    const patterns = hooks.approvalPatterns.getAllPatterns();
    const scoped = patterns.filter((pattern) => pattern.actionType === actionType);
    hooks.escalationEngine.checkForEscalations(scoped.length > 0 ? scoped : [{
      actionType,
      subType: 'default',
      consecutiveApprovals: 1,
      totalApprovals: 1,
      totalRejections: 0,
      lastApprovalAt: new Date().toISOString(),
      lastRejectionAt: null,
      autoExecuteThreshold: 3,
    }]);
    return capabilityEscalationWouldHelp(actionType, 1);
  }

  return {
    createLinkFromInsight(insight) {
      const now = new Date().toISOString();
      const recommendationId = insight.suggestedAction ? nanoid() : null;
      const actionType = insight.suggestedAction?.actionType ?? null;
      const link: OutcomeLink = {
        id: nanoid(),
        capability: resolveCapability(actionType, insight.type),
        insightId: insight.id,
        recommendationId,
        actionId: null,
        externalEffectId: null,
        actionType,
        insightType: String(insight.type),
        status: insight.suggestedAction ? 'open' : 'speculative',
        createdAt: now,
        updatedAt: now,
      };

      insertLink.run(
        link.id,
        link.capability,
        link.insightId,
        link.recommendationId,
        link.actionId,
        link.externalEffectId,
        link.actionType,
        link.insightType,
        link.status,
        link.createdAt,
        link.updatedAt,
      );

      return link;
    },

    attachRecommendation(linkId, recommendationId) {
      const existing = readLink(linkId);
      if (!existing) return null;
      const now = new Date().toISOString();
      updateLink.run(
        recommendationId,
        null,
        null,
        null,
        'open',
        null,
        null,
        null,
        null,
        now,
        linkId,
      );
      return readLink(linkId);
    },

    attachAction(linkId, actionId, actionType) {
      const existing = readLink(linkId);
      if (!existing) return null;

      const requestedCapability = resolveCapability(actionType);
      if (existing.capability !== 'general' && requestedCapability !== existing.capability) {
        return null;
      }

      const now = new Date().toISOString();
      updateLink.run(
        null,
        actionId,
        null,
        actionType,
        'open',
        null,
        null,
        null,
        null,
        now,
        linkId,
      );
      return readLink(linkId);
    },

    attachExternalEffect(linkId, externalEffectId) {
      const existing = readLink(linkId);
      if (!existing) return null;
      const now = new Date().toISOString();
      updateLink.run(
        null,
        null,
        externalEffectId,
        null,
        'open',
        null,
        null,
        null,
        null,
        now,
        linkId,
      );
      return readLink(linkId);
    },

    recordOutcome(input) {
      const existing = readLink(input.linkId);
      if (!existing) {
        return {
          accepted: false,
          learned: false,
          reason: 'link_not_found',
          link: null,
          escalationEligible: false,
        };
      }

      const measured = input.measured === true;
      const userConfirmed = input.userConfirmed === true;
      const canLearn = measured || userConfirmed;

      if (!canLearn) {
        const now = new Date().toISOString();
        updateLink.run(
          null,
          null,
          null,
          null,
          'speculative',
          JSON.stringify({ value: input.value, rejected: true }),
          0,
          0,
          0,
          now,
          input.linkId,
        );
        return {
          accepted: true,
          learned: false,
          reason: 'speculative_outcome_not_learned',
          link: readLink(input.linkId),
          escalationEligible: false,
        };
      }

      const now = new Date().toISOString();
      updateLink.run(
        null,
        null,
        null,
        null,
        'completed',
        JSON.stringify({ value: input.value }),
        1,
        measured ? 1 : 0,
        userConfirmed ? 1 : 0,
        now,
        input.linkId,
      );

      const updated = readLink(input.linkId)!;
      const escalationEligible = maybeFeedTrustLadder(updated, updated.actionType);

      return {
        accepted: true,
        learned: true,
        reason: measured ? 'measured_outcome' : 'user_confirmed_outcome',
        link: updated,
        escalationEligible,
      };
    },

    getLink(linkId) {
      return readLink(linkId);
    },

    listRecent(limit = 20) {
      const rows = listRecentStmt.all(limit) as LinkRow[];
      return rows.map(rowToLink);
    },

    listLearnedOutcomes(limit = 20) {
      const rows = listLearnedStmt.all(limit) as LinkRow[];
      return rows.map((row) => ({
        ...rowToLink(row),
        value: row.outcome_json ? JSON.parse(row.outcome_json).value : null,
      }));
    },
  };
}

export function createOutcomeLinker(
  dataDir: string,
  hooks: OutcomeLinkerHooks = {},
): OutcomeLinker {
  const dbPath = join(dataDir, 'proactive-outcomes.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  return buildOutcomeLinker(db, hooks);
}

/** In-memory linker for unit tests. */
export function createInMemoryOutcomeLinker(hooks: OutcomeLinkerHooks = {}): OutcomeLinker {
  const db = new Database(':memory:');
  return buildOutcomeLinker(db, hooks);
}

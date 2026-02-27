// Escalation Boundaries — Boundary checks for high-stakes actions in Alter Ego mode.
//
// Even in Alter Ego, some actions always require escalation:
// - Financial: amount exceeds threshold
// - Legal: language suggests contracts/agreements
// - Irreversible: actions that cannot be undone
// - Novel: action types never before approved
// - Low confidence: LLM confidence below threshold
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { ActionType } from '../types/ipc.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EscalationBoundary {
  type: 'financial_threshold' | 'legal_language' | 'irreversible' | 'novel' | 'low_confidence';
  reason: string;
  severity: 'high' | 'medium';
}

export interface BoundaryCheckInput {
  action: ActionType;
  payload: Record<string, unknown>;
  llmConfidence?: number;
}

export interface BoundaryConfig {
  financialThreshold: number;     // Dollar amount (default $500)
  confidenceThreshold: number;    // 0-1 (default 0.7)
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LEGAL_PATTERNS = [
  /\bcontract\b/i,
  /\bagreement\b/i,
  /\bbinding\b/i,
  /\bterms and conditions\b/i,
  /\bnon-disclosure\b/i,
  /\bNDA\b/,
  /\bliability\b/i,
  /\bindemnif/i,
  /\barbitration\b/i,
  /\bjurisdiction\b/i,
  /\bwaiver\b/i,
  /\bpower of attorney\b/i,
];

const IRREVERSIBLE_ACTIONS: ActionType[] = [
  'calendar.delete',
  'connector.disconnect', // Re-auth requires user interaction with third-party OAuth
];

const DEFAULT_CONFIG: BoundaryConfig = {
  financialThreshold: 500,
  confidenceThreshold: 0.7,
};

// ─── BoundaryEnforcer ───────────────────────────────────────────────────────

export class BoundaryEnforcer {
  private db: DatabaseHandle;
  private config: BoundaryConfig;

  constructor(db: DatabaseHandle, config?: Partial<BoundaryConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check all boundaries for a given action. Returns triggered boundaries.
   */
  checkBoundaries(input: BoundaryCheckInput): EscalationBoundary[] {
    const boundaries: EscalationBoundary[] = [];

    const financial = this.checkFinancial(input.payload);
    if (financial) boundaries.push(financial);

    const legal = this.checkLegal(input.payload);
    if (legal) boundaries.push(legal);

    const irreversible = this.checkIrreversible(input.action);
    if (irreversible) boundaries.push(irreversible);

    const novel = this.checkNovel(input.action);
    if (novel) boundaries.push(novel);

    if (input.llmConfidence !== undefined) {
      const lowConf = this.checkConfidence(input.llmConfidence);
      if (lowConf) boundaries.push(lowConf);
    }

    return boundaries;
  }

  /**
   * Returns true if any boundary was triggered — action should escalate.
   */
  shouldEscalate(boundaries: EscalationBoundary[]): boolean {
    return boundaries.length > 0;
  }

  // ─── Individual Checks ──────────────────────────────────────────────────

  private checkFinancial(payload: Record<string, unknown>): EscalationBoundary | null {
    const amount = payload['amount'] as number | undefined;
    if (amount !== undefined && amount > this.config.financialThreshold) {
      return {
        type: 'financial_threshold',
        reason: `Amount $${amount} exceeds threshold $${this.config.financialThreshold}`,
        severity: 'high',
      };
    }
    return null;
  }

  private checkLegal(payload: Record<string, unknown>): EscalationBoundary | null {
    // Check body and subject fields for legal language
    const textFields = ['body', 'subject', 'description', 'text', 'content'];
    for (const field of textFields) {
      const value = payload[field];
      if (typeof value === 'string') {
        for (const pattern of LEGAL_PATTERNS) {
          if (pattern.test(value)) {
            return {
              type: 'legal_language',
              reason: `Legal language detected: "${value.slice(0, 80)}..."`,
              severity: 'high',
            };
          }
        }
      }
    }
    return null;
  }

  private checkIrreversible(action: ActionType): EscalationBoundary | null {
    if (IRREVERSIBLE_ACTIONS.includes(action)) {
      return {
        type: 'irreversible',
        reason: `Action '${action}' is irreversible`,
        severity: 'high',
      };
    }
    return null;
  }

  private checkNovel(action: ActionType): EscalationBoundary | null {
    try {
      const row = this.db.prepare(
        'SELECT COUNT(*) as count FROM approval_patterns WHERE action_type = ?'
      ).get(action) as { count: number } | undefined;

      if (!row || row.count === 0) {
        return {
          type: 'novel',
          reason: `No prior approvals for action '${action}'`,
          severity: 'medium',
        };
      }
    } catch {
      // approval_patterns table may not exist — treat as novel
      return {
        type: 'novel',
        reason: `No prior approvals for action '${action}'`,
        severity: 'medium',
      };
    }
    return null;
  }

  private checkConfidence(confidence: number): EscalationBoundary | null {
    if (confidence < this.config.confidenceThreshold) {
      return {
        type: 'low_confidence',
        reason: `LLM confidence ${(confidence * 100).toFixed(0)}% below threshold ${(this.config.confidenceThreshold * 100).toFixed(0)}%`,
        severity: 'medium',
      };
    }
    return null;
  }
}

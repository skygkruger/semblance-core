// Witness Tracker — Proactive insight tracker for unattested high-value actions.
// Implements ExtensionInsightTracker from the extension system.
// CRITICAL: No networking imports.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';

export interface WitnessTrackerDeps {
  db: DatabaseHandle;
  premiumGate: PremiumGate;
}

/**
 * Checks for high-value audit trail actions that lack witness attestations
 * and suggests creating them.
 */
export class WitnessTracker implements ExtensionInsightTracker {
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;

  constructor(deps: WitnessTrackerDeps) {
    this.db = deps.db;
    this.premiumGate = deps.premiumGate;
  }

  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isPremium()) return [];

    const unattestedCount = this.getUnattestedHighValueCount();
    if (unattestedCount === 0) return [];

    return [{
      id: nanoid(),
      type: 'witness-unattested',
      priority: 'normal',
      title: 'Witness Attestation',
      summary: `${unattestedCount} high-value action${unattestedCount > 1 ? 's' : ''} in your audit trail lack${unattestedCount === 1 ? 's' : ''} a Witness attestation. Consider creating attestations to build a verifiable record.`,
      sourceIds: [],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 0,
    }];
  }

  private getUnattestedHighValueCount(): number {
    try {
      // Count audit trail entries that are high-value (e.g. email.send, calendar.create)
      // and don't have a corresponding witness attestation
      const row = this.db.prepare(`
        SELECT COUNT(*) as count FROM audit_trail
        WHERE direction = 'request'
          AND status = 'success'
          AND action IN ('email.send', 'email.draft', 'calendar.create', 'calendar.update')
          AND id NOT IN (SELECT audit_entry_id FROM witness_attestations)
      `).get() as { count: number } | undefined;
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }
}

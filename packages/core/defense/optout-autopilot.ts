/**
 * Opt-Out Autopilot — Proposes cancellation actions for low-value subscriptions.
 *
 * For subscriptions scoring 'consider_cancelling' when the user is in Alter Ego mode,
 * creates proposed cancellation actions for the autonomy system to handle.
 *
 * Does NOT execute cancellations — returns proposed actions only.
 * The existing DR cancellation flow handles actual execution.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type { AutonomyManager } from '../agent/autonomy.js';
import type { SubscriptionAdvocacy } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProposedCancellation {
  chargeId: string;
  merchantName: string;
  monthlyCost: number;
  annualCost: number;
  valueToCostRatio: number;
  reasoning: string;
  /** Whether autonomy system would auto-approve this action */
  autoApproved: boolean;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class OptOutAutopilot {
  private autonomyManager: AutonomyManager;

  constructor(config: { autonomyManager: AutonomyManager }) {
    this.autonomyManager = config.autonomyManager;
  }

  /**
   * Evaluate advocacy results and propose cancellations for subscriptions
   * scored as 'consider_cancelling'. Checks autonomy tier for the finances
   * domain to determine if auto-approval applies.
   *
   * Does NOT execute — returns proposed actions for review/execution.
   */
  evaluateCancellations(advocacyResults: SubscriptionAdvocacy[]): ProposedCancellation[] {
    const candidates = advocacyResults.filter(
      a => a.recommendation === 'consider_cancelling',
    );

    if (candidates.length === 0) return [];

    // Check if finances domain is in alter_ego mode
    const financeTier = this.autonomyManager.getDomainTier('finances');
    const isAlterEgo = financeTier === 'alter_ego';

    return candidates.map(a => ({
      chargeId: a.chargeId,
      merchantName: a.merchantName,
      monthlyCost: a.monthlyCost,
      annualCost: a.annualCost,
      valueToCostRatio: a.valueToCostRatio,
      reasoning: a.reasoning,
      autoApproved: isAlterEgo,
    }));
  }
}

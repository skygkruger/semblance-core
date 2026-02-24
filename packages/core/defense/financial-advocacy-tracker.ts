/**
 * Financial Advocacy Tracker — Proactive insight tracker for low-value subscriptions.
 *
 * Implements ExtensionInsightTracker. Queries FinancialAdvocate for subscriptions
 * scoring 'review' or 'consider_cancelling' and returns them as ProactiveInsight[].
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { nanoid } from 'nanoid';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { FinancialAdvocate } from './financial-advocate.js';

// ─── Public API ─────────────────────────────────────────────────────────────

export class FinancialAdvocacyTracker implements ExtensionInsightTracker {
  private advocate: FinancialAdvocate;
  private premiumGate: PremiumGate;

  constructor(config: { advocate: FinancialAdvocate; premiumGate: PremiumGate }) {
    this.advocate = config.advocate;
    this.premiumGate = config.premiumGate;
  }

  /**
   * Generate proactive insights from subscription advocacy analysis.
   * Only returns results for 'review' or 'consider_cancelling' subscriptions.
   * Only returns results if premium is active.
   */
  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isPremium()) {
      return [];
    }

    const advocacies = this.advocate.analyzeSubscriptions();
    const actionable = advocacies.filter(
      a => a.recommendation === 'review' || a.recommendation === 'consider_cancelling',
    );

    return actionable.map(a => ({
      id: nanoid(),
      type: 'subscription_advocacy' as const,
      priority: a.recommendation === 'consider_cancelling' ? 'high' as const : 'normal' as const,
      title: `${a.recommendation === 'consider_cancelling' ? 'Consider cancelling' : 'Review'}: ${a.merchantName}`,
      summary: a.reasoning,
      sourceIds: [a.chargeId],
      suggestedAction: a.recommendation === 'consider_cancelling'
        ? {
            actionType: 'subscription.cancel',
            payload: { chargeId: a.chargeId, merchantName: a.merchantName },
            description: `Cancel ${a.merchantName} subscription ($${a.monthlyCost.toFixed(2)}/mo)`,
          }
        : null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: a.recommendation === 'consider_cancelling' ? 300 : 60,
    }));
  }
}

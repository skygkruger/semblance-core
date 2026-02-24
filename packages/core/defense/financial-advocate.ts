/**
 * Financial Advocate — Analyzes subscription value-to-cost ratio.
 *
 * Measures usage heuristics (email mentions, browser visits, transaction frequency)
 * against cost to recommend keep/review/cancel.
 *
 * Value-to-cost ratio thresholds:
 *   < 0.3 → 'consider_cancelling'
 *   < 0.7 → 'review'
 *   >= 0.7 → 'keep'
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { RecurringDetector, RecurringCharge } from '../finance/recurring-detector.js';
import type { SubscriptionAdvocacy } from './types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const CANCEL_THRESHOLD = 0.3;
const REVIEW_THRESHOLD = 0.7;

// Estimated value per interaction type (in dollars, rough heuristic)
const VALUE_PER_EMAIL_MENTION = 0.5;
const VALUE_PER_BROWSER_VISIT = 0.25;
const VALUE_PER_TRANSACTION = 1.0;

// ─── Public API ─────────────────────────────────────────────────────────────

export class FinancialAdvocate {
  private recurringDetector: RecurringDetector;
  private db: DatabaseHandle;
  private premiumGate: PremiumGate;
  private emailSearchFn: ((merchant: string) => number) | null;

  constructor(config: {
    recurringDetector: RecurringDetector;
    db: DatabaseHandle;
    premiumGate: PremiumGate;
    emailSearchFn?: (merchant: string) => number;
  }) {
    this.recurringDetector = config.recurringDetector;
    this.db = config.db;
    this.premiumGate = config.premiumGate;
    this.emailSearchFn = config.emailSearchFn ?? null;
  }

  /**
   * Analyze all stored subscriptions and return advocacy recommendations.
   */
  analyzeSubscriptions(): SubscriptionAdvocacy[] {
    if (!this.premiumGate.isFeatureAvailable('financial-advocacy')) {
      return [];
    }

    const charges = this.recurringDetector.getStoredCharges();
    return charges
      .filter(c => c.status === 'active' || c.status === 'forgotten')
      .map(charge => this.analyzeCharge(charge));
  }

  /**
   * Get a summary advocacy report.
   */
  getAdvocacyReport(): {
    totalSubscriptions: number;
    keepCount: number;
    reviewCount: number;
    cancelCount: number;
    totalPotentialSavings: number;
  } {
    const advocacies = this.analyzeSubscriptions();
    const cancelItems = advocacies.filter(a => a.recommendation === 'consider_cancelling');
    const reviewItems = advocacies.filter(a => a.recommendation === 'review');

    return {
      totalSubscriptions: advocacies.length,
      keepCount: advocacies.filter(a => a.recommendation === 'keep').length,
      reviewCount: reviewItems.length,
      cancelCount: cancelItems.length,
      totalPotentialSavings: cancelItems.reduce((sum, a) => sum + a.annualCost, 0),
    };
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private analyzeCharge(charge: RecurringCharge): SubscriptionAdvocacy {
    const annualCost = charge.estimatedAnnualCost;
    const monthlyCost = annualCost / 12;

    // Measure usage
    const emailMentions = this.emailSearchFn ? this.emailSearchFn(charge.merchantName) : 0;
    const browserVisits = this.countBrowserVisits(charge.merchantName);
    const transactionCount = charge.chargeCount;

    // Calculate estimated value
    const estimatedValue =
      emailMentions * VALUE_PER_EMAIL_MENTION +
      browserVisits * VALUE_PER_BROWSER_VISIT +
      transactionCount * VALUE_PER_TRANSACTION;

    // Value-to-cost ratio
    const valueToCostRatio = annualCost > 0 ? estimatedValue / annualCost : 0;

    // Determine recommendation
    let recommendation: SubscriptionAdvocacy['recommendation'];
    let reasoning: string;

    if (valueToCostRatio < CANCEL_THRESHOLD) {
      recommendation = 'consider_cancelling';
      reasoning = `Low usage detected for ${charge.merchantName}. ` +
        `${emailMentions} email mentions, ${browserVisits} browser visits. ` +
        `Consider whether $${monthlyCost.toFixed(2)}/mo is worth it.`;
    } else if (valueToCostRatio < REVIEW_THRESHOLD) {
      recommendation = 'review';
      reasoning = `Moderate usage of ${charge.merchantName}. ` +
        `Usage may not justify $${monthlyCost.toFixed(2)}/mo. Worth reviewing.`;
    } else {
      recommendation = 'keep';
      reasoning = `${charge.merchantName} shows active usage. ` +
        `Good value for $${monthlyCost.toFixed(2)}/mo.`;
    }

    return {
      chargeId: charge.id,
      merchantName: charge.merchantName,
      monthlyCost: Math.round(monthlyCost * 100) / 100,
      annualCost: Math.round(annualCost * 100) / 100,
      usage: {
        emailMentions,
        browserVisits,
        transactionCount,
      },
      valueToCostRatio: Math.round(valueToCostRatio * 1000) / 1000,
      recommendation,
      reasoning,
    };
  }

  private countBrowserVisits(merchantName: string): number {
    // Query imported_items for browser_history entries matching the merchant domain
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM imported_items
        WHERE source_type = 'browser_history'
        AND (title LIKE ? OR content LIKE ?)
      `).get(`%${merchantName}%`, `%${merchantName}%`) as { cnt: number } | undefined;

      return row?.cnt ?? 0;
    } catch {
      // Table may not exist if import pipeline hasn't been initialized
      return 0;
    }
  }
}

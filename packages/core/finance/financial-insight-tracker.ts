/**
 * Financial Insight Tracker -- Generates proactive financial insights for Universal Inbox.
 *
 * Follows BirthdayTracker pattern: constructor with dependencies, generateInsights() returns ProactiveInsight[].
 *
 * Insight types:
 * - spending-alert: category changed >30% vs last month (premium only)
 * - anomaly-alert: active anomalies detected (premium only)
 * - subscription-renewal: renewals in next 7 days (free tier)
 */

import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { TransactionStore } from './transaction-store.js';
import type { SpendingAnalyzer } from './spending-analyzer.js';
import type { AnomalyDetector } from './anomaly-detector.js';
import type { RecurringDetector } from './recurring-detector.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import { nanoid } from 'nanoid';

export class FinancialInsightTracker {
  private transactionStore: TransactionStore;
  private spendingAnalyzer: SpendingAnalyzer;
  private anomalyDetector: AnomalyDetector;
  private recurringDetector: RecurringDetector;
  private premiumGate: PremiumGate;

  constructor(config: {
    transactionStore: TransactionStore;
    spendingAnalyzer: SpendingAnalyzer;
    anomalyDetector: AnomalyDetector;
    recurringDetector: RecurringDetector;
    premiumGate: PremiumGate;
  }) {
    this.transactionStore = config.transactionStore;
    this.spendingAnalyzer = config.spendingAnalyzer;
    this.anomalyDetector = config.anomalyDetector;
    this.recurringDetector = config.recurringDetector;
    this.premiumGate = config.premiumGate;
  }

  generateInsights(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const now = new Date();

    // Subscription renewals — available for all tiers (free)
    insights.push(...this.generateSubscriptionRenewalInsights(now));

    // Premium-only insights
    if (this.premiumGate.isPremium()) {
      insights.push(...this.generateSpendingAlerts(now));
      insights.push(...this.generateAnomalyAlerts(now));
    }

    return insights;
  }

  private generateSpendingAlerts(now: Date): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    try {
      const comparison = this.spendingAnalyzer.getMonthComparison(year, month);

      for (const change of comparison.categoryChanges) {
        if (Math.abs(change.changePercent) > 30) {
          const direction = change.changePercent > 0 ? 'increased' : 'decreased';
          const absPercent = Math.abs(Math.round(change.changePercent));

          insights.push({
            id: nanoid(),
            type: 'spending-alert' as ProactiveInsight['type'],
            priority: change.changePercent > 50 ? 'high' : 'normal',
            title: `${change.category} spending ${direction} ${absPercent}%`,
            summary: `Your ${change.category} spending has ${direction} by ${absPercent}% compared to last month ($${(change.currentTotal / 100).toFixed(2)} vs $${(change.previousTotal / 100).toFixed(2)}).`,
            sourceIds: [],
            suggestedAction: null,
            createdAt: now.toISOString(),
            expiresAt: null,
            estimatedTimeSavedSeconds: 300,
          });
        }
      }
    } catch {
      // No spending data available yet
    }

    return insights;
  }

  private generateAnomalyAlerts(now: Date): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];

    try {
      const activeAnomalies = this.anomalyDetector.getActiveAnomalies();

      for (const anomaly of activeAnomalies) {
        insights.push({
          id: nanoid(),
          type: 'anomaly-alert' as ProactiveInsight['type'],
          priority: anomaly.severity === 'high' ? 'high' : 'normal',
          title: anomaly.title,
          summary: anomaly.description,
          sourceIds: anomaly.transactionId ? [anomaly.transactionId] : [],
          suggestedAction: null,
          createdAt: now.toISOString(),
          expiresAt: null,
          estimatedTimeSavedSeconds: 120,
        });
      }
    } catch {
      // Anomaly detection not available
    }

    return insights;
  }

  private generateSubscriptionRenewalInsights(now: Date): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];

    try {
      const charges = this.recurringDetector.getStoredCharges('active');
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      for (const charge of charges) {
        const nextDate = this.estimateNextCharge(charge.lastChargeDate, charge.frequency);
        if (!nextDate) continue;

        const daysUntil = (nextDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);

        if (daysUntil >= 0 && daysUntil <= 7) {
          const nextDateStr = nextDate.toISOString().split('T')[0]!;
          insights.push({
            id: nanoid(),
            type: 'subscription-renewal' as ProactiveInsight['type'],
            priority: 'normal',
            title: `${charge.merchantName} renewing in ${Math.ceil(daysUntil)} days`,
            summary: `Your ${charge.merchantName} subscription ($${charge.amount.toFixed(2)}/${charge.frequency}) renews on ${nextDateStr}.`,
            sourceIds: [],
            suggestedAction: null,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + sevenDaysMs).toISOString(),
            estimatedTimeSavedSeconds: 60,
          });
        }
      }
    } catch {
      // Recurring detector not available
    }

    return insights;
  }

  private estimateNextCharge(lastChargeDate: string, frequency: string): Date | null {
    const last = new Date(lastChargeDate);
    if (isNaN(last.getTime())) return null;

    switch (frequency) {
      case 'weekly': return new Date(last.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly': { const d = new Date(last); d.setMonth(d.getMonth() + 1); return d; }
      case 'quarterly': { const d = new Date(last); d.setMonth(d.getMonth() + 3); return d; }
      case 'annual': { const d = new Date(last); d.setFullYear(d.getFullYear() + 1); return d; }
      default: return null;
    }
  }
}

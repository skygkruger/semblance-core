// Health Insight Tracker — Generates proactive insights for health trends.
// Surfaces trend changes, anomalies, and correlations via the extension interface.
// Returns empty when not premium.
// CRITICAL: This file is in packages/core/. No network imports.

import type { ExtensionInsightTracker } from '../extensions/types.js';
import type { ProactiveInsight } from '../agent/proactive-engine.js';
import type { PremiumGate, PremiumFeature } from '../premium/premium-gate.js';
import type { HealthInsightGenerator } from './health-insights.js';
import type { HealthStore } from './health-store.js';
import { nanoid } from 'nanoid';

export class HealthInsightTracker implements ExtensionInsightTracker {
  private insightGenerator: HealthInsightGenerator;
  private store: HealthStore;
  private premiumGate: PremiumGate;

  constructor(config: {
    insightGenerator: HealthInsightGenerator;
    store: HealthStore;
    premiumGate: PremiumGate;
  }) {
    this.insightGenerator = config.insightGenerator;
    this.store = config.store;
    this.premiumGate = config.premiumGate;
  }

  generateInsights(): ProactiveInsight[] {
    if (!this.premiumGate.isFeatureAvailable('health-insights' as PremiumFeature)) {
      return [];
    }

    // Check if there's enough data (at least 7 days)
    const recent = this.store.getLatestEntries(1);
    if (recent.length === 0) return [];

    const insights: ProactiveInsight[] = [];
    const now = new Date().toISOString();

    // Detect trends synchronously via the generator's detectTrend
    const trendMetrics = ['sleep_duration', 'mood', 'energy', 'steps'] as const;
    for (const metric of trendMetrics) {
      const trend = this.insightGenerator.detectTrend(metric);
      if (trend && trend.direction !== 'stable' && Math.abs(trend.changePercent) > 10) {
        const dirWord = trend.direction === 'up' ? 'increased' : 'decreased';
        insights.push({
          id: `insight_health_${nanoid(8)}`,
          type: 'health-trend-change',
          priority: Math.abs(trend.changePercent) > 30 ? 'high' : 'normal',
          title: `${metric.replace('_', ' ')} ${dirWord} ${Math.abs(Math.round(trend.changePercent))}%`,
          summary: `Your ${metric.replace('_', ' ')} has ${dirWord} from ${trend.previousAvg.toFixed(1)} to ${trend.currentAvg.toFixed(1)}.`,
          sourceIds: [],
          suggestedAction: {
            actionType: 'health_summary',
            payload: { metric },
            description: `View ${metric.replace('_', ' ')} details`,
          },
          createdAt: now,
          expiresAt: null,
          estimatedTimeSavedSeconds: 60,
        });
      }
    }

    return insights;
  }
}

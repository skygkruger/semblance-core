// Health Insight Generator — Combines correlations, trends, anomalies, streaks.
// Statistical computation first, then LLM describes.
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider } from '../llm/types.js';
import type { CorrelationEngine } from './correlation-engine.js';
import type { HealthStore } from './health-store.js';
import type { HealthInsight, HealthMetricType, TrendData } from './types.js';
import { nanoid } from 'nanoid';

export class HealthInsightGenerator {
  private correlationEngine: CorrelationEngine;
  private store: HealthStore;
  private llm: LLMProvider;
  private model: string;

  constructor(config: {
    correlationEngine: CorrelationEngine;
    store: HealthStore;
    llm: LLMProvider;
    model: string;
  }) {
    this.correlationEngine = config.correlationEngine;
    this.store = config.store;
    this.llm = config.llm;
    this.model = config.model;
  }

  /**
   * Generate all insights: trends, correlations, anomalies, streaks.
   */
  async generateInsights(windowDays: number = 30): Promise<HealthInsight[]> {
    const insights: HealthInsight[] = [];

    // Trends for key metrics
    const trendMetrics: HealthMetricType[] = ['sleep_duration', 'mood', 'energy', 'steps'];
    for (const metric of trendMetrics) {
      const trend = this.detectTrend(metric, windowDays);
      if (trend && trend.direction !== 'stable') {
        const dirWord = trend.direction === 'up' ? 'increased' : 'decreased';
        insights.push({
          id: `hi_trend_${nanoid(8)}`,
          type: 'trend',
          title: `${metric.replace('_', ' ')} ${dirWord} ${Math.abs(Math.round(trend.changePercent))}%`,
          description: `Your ${metric.replace('_', ' ')} has ${dirWord} from ${trend.previousAvg.toFixed(1)} to ${trend.currentAvg.toFixed(1)} over the past ${trend.windowDays} days.`,
          severity: Math.abs(trend.changePercent) > 30 ? 'attention' : 'info',
          basedOn: trend,
          generatedAt: new Date().toISOString(),
        });
      }
    }

    // Correlations
    const correlations = await this.correlationEngine.computeCorrelations(windowDays);
    for (const corr of correlations) {
      const desc = await this.correlationEngine.generateInsightDescription(corr, this.llm, this.model);
      insights.push({
        id: `hi_corr_${nanoid(8)}`,
        type: 'correlation',
        title: `${corr.metricA.replace('_', ' ')} correlates with ${corr.metricB.replace('_', ' ')}`,
        description: desc,
        severity: corr.significance === 'strong' ? 'attention' : 'info',
        basedOn: corr,
        generatedAt: new Date().toISOString(),
      });
    }

    // Anomalies
    for (const metric of trendMetrics) {
      const anomalies = this.detectAnomalies(metric);
      insights.push(...anomalies);
    }

    // Streaks
    for (const metric of trendMetrics) {
      const streaks = this.detectStreaks(metric);
      insights.push(...streaks);
    }

    return insights;
  }

  /**
   * Detect trend by comparing current half-window to previous half-window.
   */
  detectTrend(metric: HealthMetricType, windowDays: number = 14): TrendData | null {
    const now = new Date();
    const halfWindow = Math.floor(windowDays / 2);
    const midDate = new Date(Date.now() - halfWindow * 24 * 60 * 60 * 1000);
    const startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const currentSeries = this.store.getDailyAggregates(metric, midDate, now);
    const previousSeries = this.store.getDailyAggregates(metric, startDate, midDate);

    if (currentSeries.values.length === 0 || previousSeries.values.length === 0) return null;

    const currentAvg = currentSeries.values.reduce((a, b) => a + b, 0) / currentSeries.values.length;
    const previousAvg = previousSeries.values.reduce((a, b) => a + b, 0) / previousSeries.values.length;

    if (previousAvg === 0) return null;

    const changePercent = ((currentAvg - previousAvg) / previousAvg) * 100;
    let direction: 'up' | 'down' | 'stable';
    if (changePercent > 5) direction = 'up';
    else if (changePercent < -5) direction = 'down';
    else direction = 'stable';

    return { metric, currentAvg, previousAvg, changePercent, direction, windowDays };
  }

  /**
   * Detect anomalies: current value > 2 standard deviations from 30-day mean.
   */
  detectAnomalies(metric: HealthMetricType): HealthInsight[] {
    const insights: HealthInsight[] = [];
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const series = this.store.getDailyAggregates(metric, startDate, endDate);
    if (series.values.length < 7) return insights;

    const mean = series.values.reduce((a, b) => a + b, 0) / series.values.length;
    const variance = series.values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / series.values.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return insights;

    // Check most recent value
    const latest = series.values[series.values.length - 1]!;
    const zScore = Math.abs((latest - mean) / stdDev);

    if (zScore > 2) {
      const direction = latest > mean ? 'above' : 'below';
      insights.push({
        id: `hi_anom_${nanoid(8)}`,
        type: 'anomaly',
        title: `Unusual ${metric.replace('_', ' ')} detected`,
        description: `Today's ${metric.replace('_', ' ')} (${latest.toFixed(1)}) is ${direction} your 30-day average (${mean.toFixed(1)}) by ${zScore.toFixed(1)} standard deviations.`,
        severity: 'warning',
        basedOn: {
          metric,
          currentAvg: latest,
          previousAvg: mean,
          changePercent: ((latest - mean) / mean) * 100,
          direction: latest > mean ? 'up' : 'down',
          windowDays: 30,
        },
        generatedAt: new Date().toISOString(),
      });
    }

    return insights;
  }

  /**
   * Detect streaks: consecutive days of logging a metric.
   */
  detectStreaks(metric: HealthMetricType): HealthInsight[] {
    const insights: HealthInsight[] = [];
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const series = this.store.getDailyAggregates(metric, startDate, endDate);
    if (series.dates.length < 3) return insights;

    // Count consecutive days from most recent
    let streak = 0;
    const today = new Date().toISOString().split('T')[0]!;
    const dateSet = new Set(series.dates);

    const cursor = new Date();
    for (let i = 0; i < 30; i++) {
      const dayStr = cursor.toISOString().split('T')[0]!;
      if (dateSet.has(dayStr)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    if (streak >= 7) {
      insights.push({
        id: `hi_streak_${nanoid(8)}`,
        type: 'streak',
        title: `${streak}-day ${metric.replace('_', ' ')} streak`,
        description: `You've logged your ${metric.replace('_', ' ')} for ${streak} consecutive days. Keep it up!`,
        severity: 'info',
        basedOn: {
          metric,
          currentAvg: streak,
          previousAvg: 0,
          changePercent: 0,
          direction: 'up',
          windowDays: streak,
        },
        generatedAt: new Date().toISOString(),
      });
    }

    return insights;
  }
}

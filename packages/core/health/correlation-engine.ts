// Correlation Engine — Statistical pattern correlation.
// Computes Pearson correlation coefficient on time-series data.
// The LLM generates descriptions ONLY — it NEVER computes patterns.
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { LLMProvider } from '../llm/types.js';
import type {
  HealthMetricType,
  CalendarMetric,
  CorrelationResult,
  DailySeries,
} from './types.js';

// ─── Significance Thresholds ──────────────────────────────────────────────────

const MIN_SAMPLE_SIZE = 7;

function classifySignificance(r: number): 'strong' | 'moderate' | 'weak' | 'none' {
  const absR = Math.abs(r);
  if (absR >= 0.7) return 'strong';
  if (absR >= 0.4) return 'moderate';
  if (absR >= 0.2) return 'weak';
  return 'none';
}

// ─── Correlation Pairs ────────────────────────────────────────────────────────

interface CorrelationPair {
  metricA: HealthMetricType;
  metricB: string;
  isCalendar: boolean;
}

const CORRELATION_PAIRS: CorrelationPair[] = [
  { metricA: 'sleep_duration', metricB: 'evening_meetings', isCalendar: true },
  { metricA: 'sleep_duration', metricB: 'meeting_hours', isCalendar: true },
  { metricA: 'mood', metricB: 'workout', isCalendar: false },
  { metricA: 'energy', metricB: 'sleep_duration', isCalendar: false },
  { metricA: 'mood', metricB: 'steps', isCalendar: false },
  { metricA: 'heart_rate', metricB: 'total_meetings', isCalendar: true },
];

// ─── Correlation Engine ───────────────────────────────────────────────────────

export class CorrelationEngine {
  private db: DatabaseHandle;
  private knowledgeGraph: KnowledgeGraph;

  constructor(config: { db: DatabaseHandle; knowledgeGraph: KnowledgeGraph }) {
    this.db = config.db;
    this.knowledgeGraph = config.knowledgeGraph;
  }

  /**
   * Compute Pearson correlation coefficient between two numeric series.
   * Returns r value and sample size.
   */
  pearsonCorrelation(seriesA: number[], seriesB: number[]): { r: number; n: number } {
    const n = Math.min(seriesA.length, seriesB.length);
    if (n < 2) return { r: 0, n };

    let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
    for (let i = 0; i < n; i++) {
      const a = seriesA[i]!;
      const b = seriesB[i]!;
      sumA += a;
      sumB += b;
      sumAB += a * b;
      sumA2 += a * a;
      sumB2 += b * b;
    }

    const numerator = n * sumAB - sumA * sumB;
    const denomA = n * sumA2 - sumA * sumA;
    const denomB = n * sumB2 - sumB * sumB;
    const denominator = Math.sqrt(denomA * denomB);

    if (denominator === 0) return { r: 0, n };

    return { r: numerator / denominator, n };
  }

  /**
   * Get daily aggregated health metric values from SQLite.
   */
  getDailyMetric(type: HealthMetricType, startDate: Date, endDate: Date): DailySeries {
    const rows = this.db.prepare(
      `SELECT DATE(recorded_at) as day, AVG(value) as avg_value
       FROM health_entries
       WHERE metric_type = ? AND recorded_at >= ? AND recorded_at <= ?
       GROUP BY DATE(recorded_at)
       ORDER BY day ASC`
    ).all(type, startDate.toISOString(), endDate.toISOString()) as { day: string; avg_value: number }[];

    return {
      dates: rows.map(r => r.day),
      values: rows.map(r => r.avg_value),
    };
  }

  /**
   * Get calendar-derived metrics from the knowledge graph.
   * Reads calendar data already indexed — does NOT make IPC calls.
   */
  async getCalendarMetric(metric: CalendarMetric, startDate: Date, endDate: Date): Promise<DailySeries> {
    const results = await this.knowledgeGraph.search('calendar event meeting', {
      limit: 500,
      source: 'calendar',
    });

    // Build per-day counts from search results
    const dayMap = new Map<string, number>();

    // Initialize all days in range
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dayMap.set(cursor.toISOString().split('T')[0]!, 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    for (const result of results) {
      const meta = result.document.metadata ?? {};
      const dateStr = (meta['date'] as string | undefined) ?? result.document.id;
      const day = dateStr.split('T')[0]!;
      if (!dayMap.has(day)) continue;

      const current = dayMap.get(day) ?? 0;

      switch (metric) {
        case 'total_meetings':
          dayMap.set(day, current + 1);
          break;
        case 'evening_meetings': {
          const hour = parseInt(((meta['startHour'] as string | undefined) ?? '12'), 10);
          if (hour >= 17) dayMap.set(day, current + 1);
          break;
        }
        case 'meeting_hours': {
          const duration = parseFloat((meta['durationHours'] as string | undefined) ?? '1');
          dayMap.set(day, current + duration);
          break;
        }
        case 'back_to_back':
          // Simplified: count events as potential back-to-back
          dayMap.set(day, current + (current > 0 ? 1 : 0));
          break;
        case 'free_blocks': {
          const hours = parseFloat((meta['durationHours'] as string | undefined) ?? '1');
          dayMap.set(day, Math.max(0, 8 - (current + hours)));
          break;
        }
      }
    }

    const dates = [...dayMap.keys()].sort();
    const values = dates.map(d => dayMap.get(d) ?? 0);

    return { dates, values };
  }

  /**
   * Run all configured correlations and return significant results.
   */
  async computeCorrelations(windowDays: number = 30): Promise<CorrelationResult[]> {
    const endDate = new Date();
    const startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const results: CorrelationResult[] = [];

    for (const pair of CORRELATION_PAIRS) {
      const seriesA = this.getDailyMetric(pair.metricA, startDate, endDate);

      let seriesB: DailySeries;
      if (pair.isCalendar) {
        seriesB = await this.getCalendarMetric(pair.metricB as CalendarMetric, startDate, endDate);
      } else {
        seriesB = this.getDailyMetric(pair.metricB as HealthMetricType, startDate, endDate);
      }

      // Align series by date
      const { alignedA, alignedB } = this.alignSeries(seriesA, seriesB);

      if (alignedA.length < MIN_SAMPLE_SIZE) continue;

      const { r, n } = this.pearsonCorrelation(alignedA, alignedB);
      const significance = classifySignificance(r);

      if (significance === 'none') continue;

      results.push({
        metricA: pair.metricA,
        metricB: pair.metricB,
        correlation: Math.round(r * 100) / 100,
        sampleSize: n,
        significance,
        direction: r >= 0 ? 'positive' : 'negative',
      });
    }

    return results;
  }

  /**
   * Generate a natural language description for a statistically-computed correlation.
   * The LLM ONLY describes — it never computes patterns.
   */
  async generateInsightDescription(
    correlation: CorrelationResult,
    llm: LLMProvider,
    model: string,
  ): Promise<string> {
    const prompt = `Generate a one-sentence insight from this statistical finding. State the numbers exactly. Do NOT give medical advice.

Metric: ${correlation.metricA} vs ${correlation.metricB}
Correlation: ${correlation.correlation} (${correlation.significance} ${correlation.direction})
Sample: ${correlation.sampleSize} days`;

    const response = await llm.chat({
      model,
      messages: [
        { role: 'system', content: 'You describe statistical health correlations in plain language. Never give medical advice. State exact numbers.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 100,
    });

    return response.message.content;
  }

  /**
   * Align two daily series by date, returning only overlapping dates.
   */
  private alignSeries(a: DailySeries, b: DailySeries): { alignedA: number[]; alignedB: number[] } {
    const bMap = new Map<string, number>();
    for (let i = 0; i < b.dates.length; i++) {
      bMap.set(b.dates[i]!, b.values[i]!);
    }

    const alignedA: number[] = [];
    const alignedB: number[] = [];

    for (let i = 0; i < a.dates.length; i++) {
      const bVal = bMap.get(a.dates[i]!);
      if (bVal !== undefined) {
        alignedA.push(a.values[i]!);
        alignedB.push(bVal);
      }
    }

    return { alignedA, alignedB };
  }
}

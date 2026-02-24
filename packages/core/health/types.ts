// Health & Wellness Types — All shared types for Step 22.
// CRITICAL: This file is in packages/core/. No network imports.

// ── Metric Types ──

export type HealthMetricType =
  | 'steps'
  | 'sleep_duration'
  | 'heart_rate'
  | 'workout'
  | 'mood'
  | 'energy'
  | 'symptom'
  | 'medication'
  | 'water';

export interface HealthEntry {
  id: string;
  metricType: HealthMetricType;
  value: number;
  label?: string;
  recordedAt: string;
  source: 'healthkit' | 'manual';
  metadata?: Record<string, string>;
}

// ── Correlation Types ──

export type CalendarMetric =
  | 'total_meetings'
  | 'evening_meetings'
  | 'meeting_hours'
  | 'back_to_back'
  | 'free_blocks';

export interface CorrelationResult {
  metricA: HealthMetricType;
  metricB: string;
  correlation: number;
  sampleSize: number;
  significance: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative';
  description?: string;
}

// ── Trend Types ──

export interface TrendData {
  metric: HealthMetricType;
  currentAvg: number;
  previousAvg: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  windowDays: number;
}

// ── Daily Series (aligned time-series for correlation) ──

export interface DailySeries {
  dates: string[];
  values: number[];
}

// ── Insight Types ──

export interface HealthInsight {
  id: string;
  type: 'trend' | 'correlation' | 'anomaly' | 'streak';
  title: string;
  description: string;
  severity: 'info' | 'attention' | 'warning';
  basedOn: CorrelationResult | TrendData;
  generatedAt: string;
}

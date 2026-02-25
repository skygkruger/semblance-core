// Mobile Performance Profiler — Dev-only measurement utilities.
// Tracks cold start, memory, and generates performance reports.
// CRITICAL: No networking imports. No telemetry. Dev-only, local output.
// CRITICAL: Gated behind __DEV__ or a settings toggle. Stripped from production.

import type {
  ColdStartMetrics,
  MemoryMetrics,
  BatteryMetrics,
  PerformanceReport,
  DeviceTier,
} from '@semblance/core/performance/types';

// ─── State ──────────────────────────────────────────────────────────────────

let coldStartMark: number | null = null;
let criticalMark: number | null = null;
let importantMark: number | null = null;
let deferredMark: number | null = null;
let lastColdStart: ColdStartMetrics | null = null;
let featureLoadTimes: Record<string, number> = {};

// ─── Cold Start ─────────────────────────────────────────────────────────────

/**
 * Mark the beginning of cold start measurement.
 * Call this at the very start of app initialization.
 */
export function markColdStartBegin(): void {
  coldStartMark = Date.now();
}

/**
 * Mark the end of a cold start phase.
 */
export function markPhaseComplete(phase: 'critical' | 'important' | 'deferred'): void {
  const now = Date.now();
  if (phase === 'critical') criticalMark = now;
  else if (phase === 'important') importantMark = now;
  else if (phase === 'deferred') deferredMark = now;
}

/**
 * Finalize cold start measurement and return metrics.
 */
export function measureColdStart(): ColdStartMetrics | null {
  if (coldStartMark === null) return null;

  const now = Date.now();
  const total = now - coldStartMark;
  const critical = criticalMark ? criticalMark - coldStartMark : total;
  const important = importantMark
    ? importantMark - (criticalMark ?? coldStartMark)
    : 0;
  const deferred = deferredMark
    ? deferredMark - (importantMark ?? criticalMark ?? coldStartMark)
    : 0;

  lastColdStart = {
    totalMs: total,
    criticalPhaseMs: critical,
    importantPhaseMs: important,
    deferredPhaseMs: deferred,
    startedAt: coldStartMark,
  };

  return lastColdStart;
}

// ─── Memory ─────────────────────────────────────────────────────────────────

/**
 * Measure current memory usage.
 * Uses performance.memory on supported platforms, falls back to estimate.
 */
export function measureMemoryUsage(): MemoryMetrics {
  // In React Native, we rely on native module for accurate memory.
  // This is a JS-side approximation for dev profiling.
  const perf = typeof performance !== 'undefined' ? performance : null;
  const memory = (perf as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })?.memory;

  return {
    usedBytes: memory?.usedJSHeapSize ?? 0,
    totalBytes: memory?.totalJSHeapSize ?? 0,
    byFeature: { ...featureLoadTimes },
    measuredAt: Date.now(),
  };
}

// ─── Feature Tracking ───────────────────────────────────────────────────────

/**
 * Record a feature's load time.
 */
export function recordFeatureLoadTime(feature: string, ms: number): void {
  featureLoadTimes[feature] = ms;
}

// ─── Report ─────────────────────────────────────────────────────────────────

/**
 * Generate a comprehensive performance report.
 * Dev-only — no telemetry, purely local.
 */
export function getPerformanceReport(
  deviceTier: DeviceTier,
  battery?: BatteryMetrics,
): PerformanceReport {
  return {
    deviceTier,
    platform: 'mobile',
    coldStart: lastColdStart,
    memory: measureMemoryUsage(),
    battery: battery ?? null,
    featureLoadTimes: { ...featureLoadTimes },
    generatedAt: Date.now(),
  };
}

/**
 * Reset all profiling state. Useful between test runs or app restarts.
 */
export function resetProfiler(): void {
  coldStartMark = null;
  criticalMark = null;
  importantMark = null;
  deferredMark = null;
  lastColdStart = null;
  featureLoadTimes = {};
}

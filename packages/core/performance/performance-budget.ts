// Performance Budget — Platform and tier-specific performance thresholds.
// Budget values scale by platform (mobile/desktop) and device tier (low/mid/high).
// CRITICAL: No networking imports. Budget checking is pure local computation.

import type {
  DeviceTier,
  PlatformType,
  PerformanceBudget,
  ColdStartMetrics,
  MemoryMetrics,
} from './types.js';

// ─── Budget Definitions ─────────────────────────────────────────────────────

const BUDGETS: Record<PlatformType, Record<DeviceTier, PerformanceBudget>> = {
  mobile: {
    low: {
      coldStartMaxMs: 5000,
      memoryMaxBytes: 150 * 1024 * 1024,  // 150 MB
      featureLoadMaxMs: 2000,
      criticalPhaseMaxMs: 2500,
    },
    mid: {
      coldStartMaxMs: 3000,
      memoryMaxBytes: 200 * 1024 * 1024,  // 200 MB
      featureLoadMaxMs: 1000,
      criticalPhaseMaxMs: 1500,
    },
    high: {
      coldStartMaxMs: 2000,
      memoryMaxBytes: 300 * 1024 * 1024,  // 300 MB
      featureLoadMaxMs: 500,
      criticalPhaseMaxMs: 1000,
    },
  },
  desktop: {
    low: {
      coldStartMaxMs: 7000,
      memoryMaxBytes: 300 * 1024 * 1024,  // 300 MB
      featureLoadMaxMs: 3000,
      criticalPhaseMaxMs: 3000,
    },
    mid: {
      coldStartMaxMs: 5000,
      memoryMaxBytes: 500 * 1024 * 1024,  // 500 MB
      featureLoadMaxMs: 2000,
      criticalPhaseMaxMs: 2000,
    },
    high: {
      coldStartMaxMs: 3000,
      memoryMaxBytes: 800 * 1024 * 1024,  // 800 MB
      featureLoadMaxMs: 1000,
      criticalPhaseMaxMs: 1500,
    },
  },
};

// ─── Budget API ─────────────────────────────────────────────────────────────

/**
 * Get the performance budget for a specific platform and device tier.
 */
export function getBudget(platform: PlatformType, tier: DeviceTier): PerformanceBudget {
  return { ...BUDGETS[platform][tier] };
}

/**
 * Check if cold start metrics are within budget.
 */
export function isColdStartWithinBudget(
  metrics: ColdStartMetrics,
  platform: PlatformType,
  tier: DeviceTier,
): boolean {
  const budget = BUDGETS[platform][tier];
  return metrics.totalMs <= budget.coldStartMaxMs;
}

/**
 * Check if memory usage is within budget.
 */
export function isMemoryWithinBudget(
  metrics: MemoryMetrics,
  platform: PlatformType,
  tier: DeviceTier,
): boolean {
  const budget = BUDGETS[platform][tier];
  return metrics.usedBytes <= budget.memoryMaxBytes;
}

/**
 * Check if a feature load time is within budget.
 */
export function isFeatureLoadWithinBudget(
  loadTimeMs: number,
  platform: PlatformType,
  tier: DeviceTier,
): boolean {
  const budget = BUDGETS[platform][tier];
  return loadTimeMs <= budget.featureLoadMaxMs;
}

/**
 * Comprehensive budget check — returns per-category pass/fail.
 */
export function checkBudget(
  coldStart: ColdStartMetrics | null,
  memory: MemoryMetrics | null,
  platform: PlatformType,
  tier: DeviceTier,
): {
  coldStartOk: boolean | null;
  memoryOk: boolean | null;
  allOk: boolean;
} {
  const coldStartOk = coldStart
    ? isColdStartWithinBudget(coldStart, platform, tier)
    : null;
  const memoryOk = memory
    ? isMemoryWithinBudget(memory, platform, tier)
    : null;

  const allOk = (coldStartOk ?? true) && (memoryOk ?? true);

  return { coldStartOk, memoryOk, allOk };
}

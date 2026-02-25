// Performance Types — Metrics, budgets, and profiling types.
// Used by both core (budgets, lazy loading) and mobile (profiling, cold start).
// CRITICAL: No networking imports. All profiling is local-only. No telemetry.

// ─── Device Tier ────────────────────────────────────────────────────────────

/**
 * Device performance classification for budget scaling.
 */
export type DeviceTier = 'low' | 'mid' | 'high';

/**
 * Platform type for performance budget resolution.
 */
export type PlatformType = 'mobile' | 'desktop';

// ─── Metrics ────────────────────────────────────────────────────────────────

/**
 * Cold start timing breakdown.
 */
export interface ColdStartMetrics {
  /** Total time from app launch to first interactive frame (ms) */
  totalMs: number;
  /** Time for critical phase — UI + auth ready (ms) */
  criticalPhaseMs: number;
  /** Time for important phase — daily features loaded (ms) */
  importantPhaseMs: number;
  /** Time for deferred phase — all features loaded (ms) */
  deferredPhaseMs: number;
  /** Timestamp when measurement started */
  startedAt: number;
}

/**
 * Memory usage snapshot.
 */
export interface MemoryMetrics {
  /** Current JS heap usage in bytes */
  usedBytes: number;
  /** Total JS heap size in bytes */
  totalBytes: number;
  /** Per-feature memory allocation estimates */
  byFeature: Record<string, number>;
  /** Timestamp of snapshot */
  measuredAt: number;
}

/**
 * Battery state for optimization decisions.
 */
export interface BatteryMetrics {
  /** Battery level as percentage (0-100), or null if unavailable */
  levelPercent: number | null;
  /** Whether the device is currently charging */
  isCharging: boolean;
  /** Whether low power mode is enabled by OS */
  isLowPowerMode: boolean;
}

/**
 * Aggregated performance report.
 */
export interface PerformanceReport {
  /** Device tier classification */
  deviceTier: DeviceTier;
  /** Platform type */
  platform: PlatformType;
  /** Cold start metrics if available */
  coldStart: ColdStartMetrics | null;
  /** Current memory metrics */
  memory: MemoryMetrics | null;
  /** Current battery metrics */
  battery: BatteryMetrics | null;
  /** Per-feature load times (feature name → ms) */
  featureLoadTimes: Record<string, number>;
  /** Timestamp of report generation */
  generatedAt: number;
}

// ─── Performance Budget ─────────────────────────────────────────────────────

/**
 * Performance budget thresholds for a specific platform/tier combination.
 */
export interface PerformanceBudget {
  /** Maximum cold start time (ms) */
  coldStartMaxMs: number;
  /** Maximum memory usage (bytes) */
  memoryMaxBytes: number;
  /** Maximum per-feature load time (ms) */
  featureLoadMaxMs: number;
  /** Critical phase budget (ms) */
  criticalPhaseMaxMs: number;
}

// ─── Lazy Loading ───────────────────────────────────────────────────────────

/**
 * Registration for a lazily-loaded feature.
 */
export interface LazyFeatureRegistration {
  name: string;
  loader: () => Promise<unknown>;
  loaded: boolean;
  loadTimeMs: number | null;
}

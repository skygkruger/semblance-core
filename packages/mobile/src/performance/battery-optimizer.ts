// Battery Optimizer — Adjusts background behavior based on battery state.
//
// >50%:     Normal operation
// 20-50%:   Reduced sync frequency
// <20%:     Pause non-essential background tasks
// Charging: Restore normal operation regardless of level
//
// CRITICAL: No networking imports. No telemetry. Purely local scheduling adjustment.

import type { BatteryMetrics } from '@semblance/core/performance/types';

/**
 * Battery-aware configuration for background tasks.
 */
export interface BatteryAwareConfig {
  /** Sync interval multiplier (1.0 = normal, 2.0 = half frequency) */
  syncIntervalMultiplier: number;
  /** Whether background knowledge graph updates should run */
  allowBackgroundGraphUpdates: boolean;
  /** Whether deferred feature preloading should run */
  allowDeferredPreload: boolean;
  /** Whether model prewarming should run */
  allowModelPrewarm: boolean;
  /** Current power mode label */
  powerMode: 'normal' | 'reduced' | 'low-power';
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

const NORMAL_THRESHOLD = 50;
const LOW_THRESHOLD = 20;

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Get battery-aware configuration based on current battery state.
 * Charging always returns normal config regardless of battery level.
 */
export function getBatteryAwareConfig(battery: BatteryMetrics): BatteryAwareConfig {
  // Charging — full speed
  if (battery.isCharging) {
    return {
      syncIntervalMultiplier: 1.0,
      allowBackgroundGraphUpdates: true,
      allowDeferredPreload: true,
      allowModelPrewarm: true,
      powerMode: 'normal',
    };
  }

  const level = battery.levelPercent;

  // Level unknown — assume reduced as safe default
  if (level === null) {
    return {
      syncIntervalMultiplier: 1.5,
      allowBackgroundGraphUpdates: true,
      allowDeferredPreload: false,
      allowModelPrewarm: false,
      powerMode: 'reduced',
    };
  }

  // >50% — normal
  if (level > NORMAL_THRESHOLD) {
    return {
      syncIntervalMultiplier: 1.0,
      allowBackgroundGraphUpdates: true,
      allowDeferredPreload: true,
      allowModelPrewarm: true,
      powerMode: 'normal',
    };
  }

  // 20-50% — reduced sync
  if (level > LOW_THRESHOLD) {
    return {
      syncIntervalMultiplier: 2.0,
      allowBackgroundGraphUpdates: true,
      allowDeferredPreload: false,
      allowModelPrewarm: false,
      powerMode: 'reduced',
    };
  }

  // <20% — low power, pause non-essential
  return {
    syncIntervalMultiplier: 4.0,
    allowBackgroundGraphUpdates: false,
    allowDeferredPreload: false,
    allowModelPrewarm: false,
    powerMode: 'low-power',
  };
}

/**
 * Check if OS low power mode should force reduced behavior
 * even when battery level is above thresholds.
 */
export function shouldReduceForLowPowerMode(battery: BatteryMetrics): boolean {
  return battery.isLowPowerMode && !battery.isCharging;
}

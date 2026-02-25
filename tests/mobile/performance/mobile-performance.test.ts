// Mobile Performance Tests — Cold start optimizer, memory manager, battery optimizer.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  classifyFeature,
  shouldLoadNow,
  getPhase,
  advancePhase,
  getFeaturesForPhase,
  resetOptimizer,
} from '../../../packages/mobile/src/performance/cold-start-optimizer';
import {
  registerAllocation,
  onMemoryWarning,
  getTotalAllocated,
  getAllocations,
  resetAllocations,
} from '../../../packages/mobile/src/performance/memory-manager';
import { getBatteryAwareConfig } from '../../../packages/mobile/src/performance/battery-optimizer';
import type { BatteryMetrics } from '../../../packages/core/performance/types';

// ─── Cold Start Optimizer ───────────────────────────────────────────────────

describe('Cold Start Optimizer', () => {
  beforeEach(() => {
    resetOptimizer();
  });

  it('classifies features into correct phases', () => {
    expect(classifyFeature('ui-shell')).toBe('critical');
    expect(classifyFeature('biometric-auth')).toBe('critical');
    expect(classifyFeature('inbox')).toBe('important');
    expect(classifyFeature('chat')).toBe('important');
    expect(classifyFeature('knowledge-graph')).toBe('deferred');
    expect(classifyFeature('sovereignty')).toBe('deferred');
    expect(classifyFeature('living-will')).toBe('deferred');

    // Unknown features default to deferred
    expect(classifyFeature('unknown-feature')).toBe('deferred');
  });

  it('deferred features not loaded during critical phase', () => {
    // Phase starts as critical
    expect(getPhase()).toBe('critical');

    // Critical features should load now
    expect(shouldLoadNow('ui-shell')).toBe(true);
    expect(shouldLoadNow('biometric-auth')).toBe(true);

    // Important features should NOT load in critical phase
    expect(shouldLoadNow('inbox')).toBe(false);

    // Deferred features should NOT load in critical phase
    expect(shouldLoadNow('knowledge-graph')).toBe(false);
    expect(shouldLoadNow('sovereignty')).toBe(false);
  });

  it('deferred features load after advancing to deferred phase', () => {
    expect(getPhase()).toBe('critical');

    // Advance to important
    advancePhase();
    expect(getPhase()).toBe('important');
    expect(shouldLoadNow('inbox')).toBe(true);
    expect(shouldLoadNow('sovereignty')).toBe(false);

    // Advance to deferred
    advancePhase();
    expect(getPhase()).toBe('deferred');
    expect(shouldLoadNow('sovereignty')).toBe(true);
    expect(shouldLoadNow('knowledge-graph')).toBe(true);
  });
});

// ─── Memory Manager ─────────────────────────────────────────────────────────

describe('Memory Manager', () => {
  beforeEach(() => {
    resetAllocations();
  });

  it('releases non-essential caches on memory warning', () => {
    let graphReleased = false;
    let authReleased = false;

    registerAllocation('knowledge-graph', 20 * 1024 * 1024, () => { graphReleased = true; }, false);
    registerAllocation('biometric-auth', 5 * 1024 * 1024, () => { authReleased = true; }, true);

    const released = onMemoryWarning();

    // Non-essential cache released
    expect(graphReleased).toBe(true);
    expect(released).toContain('knowledge-graph');

    // Essential cache NOT released
    expect(authReleased).toBe(false);
    expect(released).not.toContain('biometric-auth');
  });
});

// ─── Battery Optimizer ──────────────────────────────────────────────────────

describe('Battery Optimizer', () => {
  it('reduces sync frequency below 50%', () => {
    const battery: BatteryMetrics = {
      levelPercent: 35,
      isCharging: false,
      isLowPowerMode: false,
    };

    const config = getBatteryAwareConfig(battery);

    expect(config.powerMode).toBe('reduced');
    expect(config.syncIntervalMultiplier).toBeGreaterThan(1.0);
    expect(config.allowDeferredPreload).toBe(false);
  });

  it('pauses background tasks below 20%', () => {
    const battery: BatteryMetrics = {
      levelPercent: 12,
      isCharging: false,
      isLowPowerMode: false,
    };

    const config = getBatteryAwareConfig(battery);

    expect(config.powerMode).toBe('low-power');
    expect(config.allowBackgroundGraphUpdates).toBe(false);
    expect(config.allowDeferredPreload).toBe(false);
    expect(config.allowModelPrewarm).toBe(false);
    expect(config.syncIntervalMultiplier).toBeGreaterThanOrEqual(4.0);
  });
});

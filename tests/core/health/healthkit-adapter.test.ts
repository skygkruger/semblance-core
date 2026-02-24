/**
 * Step 22 — HealthKit Adapter tests.
 * Tests NoOpHealthKitAdapter (default for non-iOS platforms).
 */

import { describe, it, expect } from 'vitest';
import { NoOpHealthKitAdapter } from '@semblance/core/health/healthkit-adapter';

describe('NoOpHealthKitAdapter (Step 22)', () => {
  const adapter = new NoOpHealthKitAdapter();

  it('isAvailable() returns false', () => {
    expect(adapter.isAvailable()).toBe(false);
  });

  it('fetchSteps() returns empty array', async () => {
    const result = await adapter.fetchSteps(new Date(), new Date());
    expect(result).toEqual([]);
  });

  it('fetchSleep() returns empty array', async () => {
    const result = await adapter.fetchSleep(new Date(), new Date());
    expect(result).toEqual([]);
  });

  it('requestAuthorization() returns false', async () => {
    const result = await adapter.requestAuthorization();
    expect(result).toBe(false);
  });
});

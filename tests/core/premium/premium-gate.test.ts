/**
 * Step 19 -- PremiumGate tests.
 * Tests isPremium, getLicenseTier, feature availability, activation valid/invalid.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

function makeLicenseKey(tier: string, exp?: string): string {
  const payload = JSON.stringify({ tier, exp });
  const encoded = Buffer.from(payload).toString('base64');
  return `sem_header.${encoded}.signature`;
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('PremiumGate (Step 19)', () => {
  it('isPremium returns false with no license', () => {
    expect(gate.isPremium()).toBe(false);
    expect(gate.getLicenseTier()).toBe('free');
  });

  it('isPremium returns true after valid activation', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const key = makeLicenseKey('digital-representative', futureDate);

    const result = gate.activateLicense(key);
    expect(result.success).toBe(true);
    expect(result.tier).toBe('digital-representative');
    expect(gate.isPremium()).toBe(true);
    expect(gate.getLicenseTier()).toBe('digital-representative');
  });

  it('feature availability returns empty for free tier', () => {
    expect(gate.getAvailableFeatures()).toHaveLength(0);
    expect(gate.isFeatureAvailable('spending-insights')).toBe(false);
    expect(gate.isFeatureAvailable('plaid-integration')).toBe(false);
  });

  it('feature availability returns all features for premium tier', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    gate.activateLicense(makeLicenseKey('digital-representative', futureDate));

    const features = gate.getAvailableFeatures();
    expect(features).toContain('transaction-categorization');
    expect(features).toContain('spending-insights');
    expect(features).toContain('anomaly-detection');
    expect(features).toContain('plaid-integration');
    expect(features).toContain('financial-dashboard');
    expect(features).toContain('representative-drafting');
    expect(features).toContain('subscription-cancellation');
    expect(features).toContain('representative-dashboard');
    expect(features).toContain('form-automation');
    expect(features).toContain('bureaucracy-tracking');
    expect(features).toContain('health-tracking');
    expect(features).toContain('health-insights');
    expect(features).toContain('import-digital-life');
    expect(features).toContain('dark-pattern-detection');
    expect(features).toContain('financial-advocacy');
    expect(features).toHaveLength(15);

    expect(gate.isFeatureAvailable('spending-insights')).toBe(true);
  });

  it('rejects invalid license key format', () => {
    // No sem_ prefix
    let result = gate.activateLicense('invalid-key');
    expect(result.success).toBe(false);
    expect(result.error).toContain('must start with sem_');

    // Wrong number of segments
    result = gate.activateLicense('sem_only-two.segments');
    expect(result.success).toBe(false);
    expect(result.error).toContain('3 dot-separated segments');

    // Invalid base64 payload
    result = gate.activateLicense('sem_a.!!!notbase64!!!.c');
    expect(result.success).toBe(false);
  });

  it('rejects expired license key', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const key = makeLicenseKey('digital-representative', pastDate);

    const result = gate.activateLicense(key);
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(gate.isPremium()).toBe(false);
  });
});

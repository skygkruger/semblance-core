/**
 * PremiumGate.activateLicense() with real Ed25519 signature verification.
 *
 * Tests the full pipeline: sem_ key → signature verification → payload decode → SQLite storage.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { setLicensePublicKey } from '@semblance/core/premium/license-keys';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  validDRKey,
  validLifetimeKey,
  expiredKey,
  tamperedKey,
} from '../../fixtures/license-keys';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('PremiumGate.activateLicense with signature verification', () => {
  it('valid signed key activates', () => {
    const key = validDRKey();
    const result = gate.activateLicense(key);

    expect(result.success).toBe(true);
    expect(result.tier).toBe('digital-representative');
    expect(gate.isPremium()).toBe(true);
    expect(gate.getLicenseTier()).toBe('digital-representative');
  });

  it('valid lifetime key activates', () => {
    const key = validLifetimeKey();
    const result = gate.activateLicense(key);

    expect(result.success).toBe(true);
    expect(result.tier).toBe('lifetime');
    expect(gate.isPremium()).toBe(true);
    expect(gate.getLicenseTier()).toBe('lifetime');
  });

  it('invalid signature rejects', () => {
    const key = tamperedKey();
    const result = gate.activateLicense(key);

    expect(result.success).toBe(false);
    expect(result.error).toContain('signature verification failed');
    expect(gate.isPremium()).toBe(false);
  });

  it('expired key rejects', () => {
    const key = expiredKey();
    const result = gate.activateLicense(key);

    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(gate.isPremium()).toBe(false);
  });

  it('tier upgrade from free to digital-representative', () => {
    expect(gate.getLicenseTier()).toBe('free');
    expect(gate.isPremium()).toBe(false);

    const key = validDRKey();
    gate.activateLicense(key);

    expect(gate.getLicenseTier()).toBe('digital-representative');
    expect(gate.isPremium()).toBe(true);
    expect(gate.isFeatureAvailable('spending-insights')).toBe(true);
  });

  it('already-active license gets overwritten', () => {
    // Activate DR first
    const drKey = validDRKey();
    gate.activateLicense(drKey);
    expect(gate.getLicenseTier()).toBe('digital-representative');

    // Upgrade to lifetime
    const ltKey = validLifetimeKey();
    gate.activateLicense(ltKey);
    expect(gate.getLicenseTier()).toBe('lifetime');
  });
});

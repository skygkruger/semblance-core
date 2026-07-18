/**
 * PremiumGate Founding Member Tests
 *
 * Tests founding member activation, tier checking, and feature availability
 * via PremiumGate with an in-memory SQLite database.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { PremiumGate } from '../../packages/core/premium/premium-gate.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import { setLicensePublicKey } from '../../packages/core/premium/license-keys.js';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../fixtures/license-keys.js';

function createTestDb(): DatabaseHandle {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db as unknown as DatabaseHandle;
}

beforeAll(() => {
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

describe('PremiumGate: reservation tokens cannot activate entitlement', () => {
  let gate: PremiumGate;
  let db: DatabaseHandle;

  beforeEach(() => {
    db = createTestDb();
    gate = new PremiumGate(db);
  });

  it('starts at free tier with no founding member status', () => {
    expect(gate.getLicenseTier()).toBe('free');
    expect(gate.isPremium()).toBe(false);
    expect(gate.isFoundingMember()).toBe(false);
    expect(gate.getFoundingSeat()).toBeNull();
  });

  it('has no founding-reservation activation writer', () => {
    expect('activateFoundingMember' in gate).toBe(false);
    expect(gate.getLicenseTier()).toBe('free');
    expect(gate.isPremium()).toBe(false);
  });
});

describe('PremiumGate: paid sem_ founding entitlement', () => {
  let gate: PremiumGate;

  beforeEach(() => {
    const db = createTestDb();
    gate = new PremiumGate(db);
  });

  it('keeps a valid paid founding key premium', () => {
    const paidFoundingKey = generateTestLicenseKey({
      tier: 'founding',
      seat: 42,
      sub: 'paid-customer',
    });
    const result = gate.activateLicense(paidFoundingKey);
    expect(result).toMatchObject({ success: true, tier: 'founding' });
    expect(gate.isPremium()).toBe(true);
    expect(gate.isFoundingMember()).toBe(true);
    expect(gate.getFoundingSeat()).toBe(42);
  });
});

describe('PremiumGate: LicenseTier type includes founding', () => {
  it('founding is valid only through the paid sem_ license path', () => {
    const db = createTestDb();
    const gate = new PremiumGate(db);
    gate.activateLicense(generateTestLicenseKey({ tier: 'founding', seat: 1 }));
    const tier = gate.getLicenseTier();
    expect(['free', 'founding', 'digital-representative', 'lifetime']).toContain(tier);
    expect(tier).toBe('founding');
  });
});

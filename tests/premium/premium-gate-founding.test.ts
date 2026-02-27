/**
 * PremiumGate Founding Member Tests
 *
 * Tests founding member activation, tier checking, and feature availability
 * via PremiumGate with an in-memory SQLite database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PremiumGate } from '../../packages/core/premium/premium-gate.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import {
  VALID_TOKEN_SEAT_1,
  VALID_TOKEN_SEAT_500,
  WRONG_TIER_TOKEN,
  TAMPERED_SIGNATURE_TOKEN,
} from '../fixtures/founding-tokens.js';

function createTestDb(): DatabaseHandle {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db as unknown as DatabaseHandle;
}

describe('PremiumGate: Founding Member Activation', () => {
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

  it('activates a valid founding member token (seat #1)', () => {
    const result = gate.activateFoundingMember(VALID_TOKEN_SEAT_1);
    expect(result.success).toBe(true);
    expect(result.tier).toBe('founding');
    expect(result.error).toBeUndefined();

    expect(gate.getLicenseTier()).toBe('founding');
    expect(gate.isPremium()).toBe(true);
    expect(gate.isFoundingMember()).toBe(true);
    expect(gate.getFoundingSeat()).toBe(1);
  });

  it('activates a valid founding member token (seat #500)', () => {
    const result = gate.activateFoundingMember(VALID_TOKEN_SEAT_500);
    expect(result.success).toBe(true);
    expect(result.tier).toBe('founding');

    expect(gate.getFoundingSeat()).toBe(500);
  });

  it('rejects a tampered token', () => {
    const result = gate.activateFoundingMember(TAMPERED_SIGNATURE_TOKEN);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // Should remain at free tier
    expect(gate.getLicenseTier()).toBe('free');
    expect(gate.isFoundingMember()).toBe(false);
  });

  it('rejects a wrong-tier token', () => {
    const result = gate.activateFoundingMember(WRONG_TIER_TOKEN);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    expect(gate.getLicenseTier()).toBe('free');
  });

  it('handles duplicate activation idempotently', () => {
    const first = gate.activateFoundingMember(VALID_TOKEN_SEAT_1);
    expect(first.success).toBe(true);

    // Activate again — should succeed and not create duplicate rows
    const second = gate.activateFoundingMember(VALID_TOKEN_SEAT_1);
    expect(second.success).toBe(true);
    expect(gate.isFoundingMember()).toBe(true);
    expect(gate.getFoundingSeat()).toBe(1);
  });

  it('updates seat number when activating with a different valid token', () => {
    gate.activateFoundingMember(VALID_TOKEN_SEAT_1);
    expect(gate.getFoundingSeat()).toBe(1);

    gate.activateFoundingMember(VALID_TOKEN_SEAT_500);
    expect(gate.getFoundingSeat()).toBe(500);
  });
});

describe('PremiumGate: Founding Tier Feature Access', () => {
  let gate: PremiumGate;

  beforeEach(() => {
    const db = createTestDb();
    gate = new PremiumGate(db);
    gate.activateFoundingMember(VALID_TOKEN_SEAT_1);
  });

  it('founding members have premium access', () => {
    expect(gate.isPremium()).toBe(true);
  });

  it('founding members can access all digital-representative features', () => {
    // Founding tier rank equals digital-representative rank (both 1)
    expect(gate.isFeatureAvailable('transaction-categorization')).toBe(true);
    expect(gate.isFeatureAvailable('representative-drafting')).toBe(true);
    expect(gate.isFeatureAvailable('subscription-cancellation')).toBe(true);
    expect(gate.isFeatureAvailable('form-automation')).toBe(true);
    expect(gate.isFeatureAvailable('health-tracking')).toBe(true);
    expect(gate.isFeatureAvailable('living-will')).toBe(true);
    expect(gate.isFeatureAvailable('witness-attestation')).toBe(true);
    expect(gate.isFeatureAvailable('inheritance-protocol')).toBe(true);
    expect(gate.isFeatureAvailable('proof-of-privacy')).toBe(true);
  });

  it('founding member tier never expires', () => {
    // isPremium should return true even without expires_at
    expect(gate.isPremium()).toBe(true);
  });

  it('getAvailableFeatures returns all features for founding members', () => {
    const features = gate.getAvailableFeatures();
    expect(features.length).toBeGreaterThan(0);
    expect(features).toContain('transaction-categorization');
    expect(features).toContain('representative-drafting');
  });
});

describe('PremiumGate: LicenseTier type includes founding', () => {
  it('founding is a valid tier value', () => {
    const db = createTestDb();
    const gate = new PremiumGate(db);
    gate.activateFoundingMember(VALID_TOKEN_SEAT_1);
    const tier = gate.getLicenseTier();
    expect(['free', 'founding', 'digital-representative', 'lifetime']).toContain(tier);
    expect(tier).toBe('founding');
  });
});

import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { PremiumGate } from '../../packages/core/premium/premium-gate.js';
import {
  createKernelEntitlementSnapshotSource,
  refreshKernelEntitlementSnapshotSource,
} from '../../packages/core/premium/kernel-entitlement-source.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';
import { createEntitlementService, createMemoryKeyStore } from '../../packages/kernel/src/index.js';
import { setLicensePublicKey } from '../../packages/core/premium/license-keys.js';
import { VALID_TOKEN_SEAT_1 } from '../fixtures/founding-tokens.js';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../fixtures/license-keys.js';
import {
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  LEGACY_SEM_ISSUER_KEY_ID,
  setEntitlementIssuerPublicKey,
} from '../../packages/kernel/src/entitlement/verifier.js';

function createTestDb(): DatabaseHandle {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  return db as unknown as DatabaseHandle;
}

describe('PremiumGate kernel authority', () => {
  it('blocks direct activateLicense when kernel source is wired', () => {
    setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
    setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
    setEntitlementIssuerPublicKey(LEGACY_SEM_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);

    const gate = new PremiumGate(createTestDb());
    const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'device-premium-gate' });
    const source = createKernelEntitlementSnapshotSource();
    gate.setEntitlementSource(source);

    const blocked = gate.activateLicense(generateTestLicenseKey({
      tier: 'digital-representative',
      exp: new Date(Date.now() + 86400000).toISOString(),
      sub: 'customer',
    }));
    expect(blocked.success).toBe(false);
    expect(blocked.error).toContain('kernel-authoritative');
  });

  it('reflects kernel activation through PremiumGate snapshot', async () => {
    setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
    setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
    setEntitlementIssuerPublicKey(LEGACY_SEM_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);

    const gate = new PremiumGate(createTestDb());
    const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'device-premium-gate' });
    const source = createKernelEntitlementSnapshotSource();
    gate.setEntitlementSource(source);

    const key = generateTestLicenseKey({
      tier: 'digital-representative',
      exp: new Date(Date.now() + 86400000).toISOString(),
      sub: 'customer',
    });
    const activation = await service.activate(key);
    expect(activation.success).toBe(true);
    await refreshKernelEntitlementSnapshotSource(source, service);

    expect(gate.isPremium()).toBe(true);
    expect(gate.getLicenseTier()).toBe('digital-representative');
  });

  it('never grants premium from reservation artifacts through kernel activation', async () => {
    const gate = new PremiumGate(createTestDb());
    const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'device-reservation' });
    const source = createKernelEntitlementSnapshotSource();
    gate.setEntitlementSource(source);

    const reservation = await service.activate(VALID_TOKEN_SEAT_1);
    expect(reservation.success).toBe(false);
    await refreshKernelEntitlementSnapshotSource(source, service);

    expect(gate.isPremium()).toBe(false);
    expect(gate.getLicenseTier()).toBe('free');
  });
});

describe('founding premium path grep guard', () => {
  it('does not expose activateFoundingMember on PremiumGate', () => {
    const gate = new PremiumGate(createTestDb());
    expect('activateFoundingMember' in gate).toBe(false);
    expect('activateFounding' in gate).toBe(false);
  });
});

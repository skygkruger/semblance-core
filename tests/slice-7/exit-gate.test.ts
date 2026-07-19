import { createPrivateKey, sign } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import type { SignedEntitlementV1 } from '@semblance/protocol';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import {
  createKernelEntitlementSnapshotSource,
  refreshKernelEntitlementSnapshotSource,
} from '@semblance/core/premium/kernel-entitlement-source';
import {
  createEntitlementService,
  createMemoryKeyStore,
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  LEGACY_SEM_ISSUER_KEY_ID,
  setEntitlementIssuerPublicKey,
  entitlementSigningPayload,
  revokeEntitlement,
} from '@semblance/kernel';
import {
  LICENSE_TEST_PRIVATE_KEY_PEM,
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../fixtures/license-keys.js';
import { VALID_TOKEN_SEAT_1 } from '../fixtures/founding-tokens.js';
import releaseManifest from '../../release/release-manifest.json';

const REPRESENTATIVE_COMMERCE_WORKER = resolve(
  __dirname,
  '../../../semblence-representative/infrastructure/commerce-worker',
);

function signTestEntitlement(
  unsigned: Omit<SignedEntitlementV1, 'signature'>,
): SignedEntitlementV1 {
  const payload = entitlementSigningPayload(unsigned);
  const privateKey = createPrivateKey(LICENSE_TEST_PRIVATE_KEY_PEM);
  const signatureBytes = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return {
    ...unsigned,
    signature: `ed25519:${signatureBytes.toString('base64url')}`,
  };
}

function validUnsignedEntitlement(
  overrides: Partial<Omit<SignedEntitlementV1, 'signature'>> = {},
): Omit<SignedEntitlementV1, 'signature'> {
  return {
    schemaVersion: 1,
    entitlementId: 'ent-slice7-exit',
    memberId: 'member-slice7-exit',
    tier: 'digital-representative',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(),
    offlineGraceDays: 30,
    revocationEpoch: 0,
    issuerKeyId: DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
    ...overrides,
  };
}

function createPremiumGateWithKernel(db: DatabaseHandle) {
  setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
  setEntitlementIssuerPublicKey(LEGACY_SEM_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);

  const gate = new PremiumGate(db);
  const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'device-slice7-exit' });
  const source = createKernelEntitlementSnapshotSource();
  gate.setEntitlementSource(source);
  return { gate, service, source };
}

beforeAll(() => {
  setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
  setEntitlementIssuerPublicKey(LEGACY_SEM_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
});

describe('Slice 7 exit gate — kernel paid authority', () => {
  it('test purchase activates entitlement and PremiumGate reports premium', async () => {
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    const { gate, service, source } = createPremiumGateWithKernel(db);

    const purchaseKey = generateTestLicenseKey({
      tier: 'digital-representative',
      exp: new Date(Date.now() + 35 * 86400000).toISOString(),
      sub: 'customer-purchase',
    });

    const activation = await service.activate(purchaseKey);
    expect(activation.success).toBe(true);
    await refreshKernelEntitlementSnapshotSource(source, service);

    expect(gate.isPremium()).toBe(true);
    expect(gate.getLicenseTier()).toBe('digital-representative');
  });

  it('renewal extends validUntil and keeps premium active', async () => {
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    const { gate, service, source } = createPremiumGateWithKernel(db);

    const initial = signTestEntitlement(validUnsignedEntitlement({
      entitlementId: 'ent-renewal',
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
    }));
    await service.activate(initial);
    await refreshKernelEntitlementSnapshotSource(source, service);
    expect(gate.isPremium()).toBe(true);

    const renewed = signTestEntitlement(validUnsignedEntitlement({
      entitlementId: 'ent-renewal',
      validUntil: new Date(Date.now() + 35 * 86400000).toISOString(),
    }));
    const renewal = await service.activate(renewed);
    expect(renewal.success).toBe(true);
    await refreshKernelEntitlementSnapshotSource(source, service);
    expect(gate.isPremium()).toBe(true);
  });

  it('refund/revocation clears premium authority', async () => {
    const keyStore = createMemoryKeyStore();
    const service = createEntitlementService(keyStore, { deviceId: 'device-revoke' });
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    const gate = new PremiumGate(db);
    const source = createKernelEntitlementSnapshotSource();
    gate.setEntitlementSource(source);

    const entitlement = signTestEntitlement(validUnsignedEntitlement({ entitlementId: 'ent-revoke' }));
    await service.activate(entitlement);
    await refreshKernelEntitlementSnapshotSource(source, service);
    expect(gate.isPremium()).toBe(true);

    await revokeEntitlement(keyStore, entitlement);
    await service.revokeLocalEntitlement();
    await refreshKernelEntitlementSnapshotSource(source, service);

    expect(gate.isPremium()).toBe(false);
    expect(await service.getSnapshot()).toBeNull();
  });

  it('offline grace keeps premium active after validUntil within grace window', async () => {
    const service = createEntitlementService(createMemoryKeyStore(), { deviceId: 'device-grace' });
    const validUntil = new Date(Date.now() - 2 * 86400000).toISOString();
    const entitlement = signTestEntitlement(validUnsignedEntitlement({
      entitlementId: 'ent-grace',
      validUntil,
      offlineGraceDays: 30,
    }));

    await service.activate(entitlement);
    const snapshot = await service.getSnapshot();
    expect(snapshot?.active).toBe(true);
    expect(snapshot?.inGracePeriod).toBe(true);
  });

  it('restart persistence reloads active entitlement from key store', async () => {
    const keyStore = createMemoryKeyStore();
    const deviceId = 'device-restart';
    const entitlement = signTestEntitlement(validUnsignedEntitlement({ entitlementId: 'ent-restart' }));

    const beforeRestart = createEntitlementService(keyStore, { deviceId });
    await beforeRestart.activate(entitlement);
    expect((await beforeRestart.getSnapshot())?.active).toBe(true);

    const afterRestart = createEntitlementService(keyStore, { deviceId });
    const persisted = await afterRestart.getSnapshot();
    expect(persisted?.active).toBe(true);
    expect(persisted?.tier).toBe('digital-representative');
  });

  it('reservation_only artifacts never grant premium', async () => {
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    const { gate, service, source } = createPremiumGateWithKernel(db);

    const reservation = await service.activate(VALID_TOKEN_SEAT_1);
    expect(reservation.success).toBe(false);
    expect(reservation.error).toContain('Reservation artifacts never grant paid entitlement');
    await refreshKernelEntitlementSnapshotSource(source, service);

    expect(gate.isPremium()).toBe(false);
    expect(gate.getLicenseTier()).toBe('free');
  });

  it('unpaid sem_ key with expired payload does not grant premium', async () => {
    const db = new Database(':memory:') as unknown as DatabaseHandle;
    const { gate, service, source } = createPremiumGateWithKernel(db);

    const expiredKey = generateTestLicenseKey({
      tier: 'digital-representative',
      exp: new Date(Date.now() - 86400000).toISOString(),
      sub: 'expired-customer',
    });

    const activation = await service.activate(expiredKey);
    expect(activation.success).toBe(false);
    await refreshKernelEntitlementSnapshotSource(source, service);
    expect(gate.isPremium()).toBe(false);
  });
});

describe('Slice 7 exit gate — commerce worker contracts (private repo)', () => {
  it('founding seat allocator: 1000 concurrent attempts yield exactly 500 unique seats', async () => {
    const {
      createMemorySeatStore,
      createSeatAllocator,
      MAX_FOUNDING_SEATS,
      SeatAllocationError,
    } = await import(
      `${REPRESENTATIVE_COMMERCE_WORKER}/src/founding/seat-allocator.js`
    );

    const allocator = createSeatAllocator(createMemorySeatStore());
    const attempts = Array.from({ length: 1000 }, (_, index) =>
      allocator.allocateSeat(`slice7-res-${index}`),
    );
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(MAX_FOUNDING_SEATS);
    expect(rejected).toHaveLength(1000 - MAX_FOUNDING_SEATS);
    for (const failure of rejected) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(SeatAllocationError);
    }

    const seatNumbers = fulfilled.map((result) => (result as PromiseFulfilledResult<number>).value);
    expect(new Set(seatNumbers).size).toBe(MAX_FOUNDING_SEATS);
  });

  it('duplicate Stripe webhook delivery is idempotent', async () => {
    const { handleWebhook } = await import(`${REPRESENTATIVE_COMMERCE_WORKER}/src/webhook.js`);
    const {
      createMemoryWebhookIdempotencyStore,
    } = await import(`${REPRESENTATIVE_COMMERCE_WORKER}/src/webhook-idempotency.js`);
    const {
      frozenEnv,
      renewalInvoiceEvent,
      signStripeBody,
      storeWithActiveCustomer,
      testIssuer,
      TEST_NOW,
    } = await import(`${REPRESENTATIVE_COMMERCE_WORKER}/tests/helpers.js`);

    const customerId = 'cus_slice7_idempotent';
    const event = renewalInvoiceEvent(customerId, 'evt_slice7_idempotent');
    const rawBody = JSON.stringify(event);
    const signatureHeader = await signStripeBody(rawBody);
    const deps = {
      store: storeWithActiveCustomer(customerId),
      issuer: testIssuer(),
      idempotency: createMemoryWebhookIdempotencyStore(),
      nowSeconds: TEST_NOW,
    };

    const first = await handleWebhook({ rawBody, signatureHeader, event }, frozenEnv(), deps);
    const second = await handleWebhook({ rawBody, signatureHeader, event }, frozenEnv(), deps);

    expect(first).toMatchObject({ status: 'renewed', entitlementIssued: true });
    expect(second).toMatchObject({ status: 'duplicate', entitlementIssued: false, httpStatus: 200 });
  });

  it('charge.refunded marks license refunded in commerce store', async () => {
    const { handleWebhook } = await import(`${REPRESENTATIVE_COMMERCE_WORKER}/src/webhook.js`);
    const {
      frozenEnv,
      refundEvent,
      signStripeBody,
      storeWithActiveCustomer,
      testIssuer,
      TEST_NOW,
    } = await import(`${REPRESENTATIVE_COMMERCE_WORKER}/tests/helpers.js`);

    const customerId = 'cus_slice7_refund';
    const event = refundEvent(customerId, 'evt_slice7_refund');
    const rawBody = JSON.stringify(event);
    const signatureHeader = await signStripeBody(rawBody);
    const store = storeWithActiveCustomer(customerId, 'lifetime');

    const result = await handleWebhook(
      { rawBody, signatureHeader, event },
      frozenEnv(),
      { store, issuer: testIssuer(), nowSeconds: TEST_NOW },
    );

    expect(result).toMatchObject({ status: 'refunded', entitlementIssued: false });
    expect(store.licenses.get(customerId)?.status).toBe('refunded');
  });
});

describe('Slice 7 exit gate — release manifest evidence state', () => {
  it('documents commerce sales enabled after exit gate evidence', () => {
    expect(releaseManifest.commerce.newSalesEnabled).toBe(true);
    expect(releaseManifest.completedSlices).toContain(7);
    // releaseId advances with later slices; Slice 7 only requires sales remain enabled.
  });
});

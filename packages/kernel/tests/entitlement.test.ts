import { createPrivateKey, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SignedEntitlementV1 } from '@semblance/protocol';
import { createMemoryKeyStore } from '../src/keys/memory-key-store.js';
import { createEntitlementService } from '../src/entitlement/service.js';
import { evaluateSubscriptionGrace } from '../src/entitlement/grace.js';
import {
  enrollDevice,
  isDeviceEnrolled,
  MAX_ENROLLED_DEVICES,
  removeEnrolledDevice,
  transferDeviceEnrollment,
} from '../src/entitlement/device-enrollment.js';
import {
  isRevoked,
  revokeEntitlement,
} from '../src/entitlement/revocation.js';
import {
  DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
  LEGACY_SEM_ISSUER_KEY_ID,
  setEntitlementIssuerPublicKey,
  verifySignedEntitlementV1,
} from '../src/entitlement/verifier.js';
import { entitlementSigningPayload } from '../src/entitlement/signing-payload.js';
import { adaptLegacySemKey } from '../src/entitlement/legacy-adapter.js';
import {
  LICENSE_TEST_PRIVATE_KEY_PEM,
  LICENSE_TEST_PUBLIC_KEY_PEM,
  generateTestLicenseKey,
} from '../../../tests/fixtures/license-keys.js';
import { VALID_TOKEN_SEAT_1 } from '../../../tests/fixtures/founding-tokens.js';

const TEST_DEVICE_ID = 'device-test-primary';

function signTestEntitlement(
  unsigned: Omit<SignedEntitlementV1, 'signature'>,
  privateKeyPem = LICENSE_TEST_PRIVATE_KEY_PEM,
): SignedEntitlementV1 {
  const payload = entitlementSigningPayload(unsigned);
  const privateKey = createPrivateKey(privateKeyPem);
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
    entitlementId: 'ent-test-001',
    memberId: 'member-test-001',
    tier: 'digital-representative',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    offlineGraceDays: 30,
    revocationEpoch: 0,
    issuerKeyId: DEFAULT_ENTITLEMENT_ISSUER_KEY_ID,
    ...overrides,
  };
}

function createService(deviceId = TEST_DEVICE_ID) {
  return createEntitlementService(createMemoryKeyStore(), { deviceId });
}

beforeAll(() => {
  setEntitlementIssuerPublicKey(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
  setEntitlementIssuerPublicKey(LEGACY_SEM_ISSUER_KEY_ID, LICENSE_TEST_PUBLIC_KEY_PEM);
});

describe('kernel entitlement verification', () => {
  it('accepts a valid signed entitlement', () => {
    const entitlement = signTestEntitlement(validUnsignedEntitlement());
    const result = verifySignedEntitlementV1(entitlement);
    expect(result.valid).toBe(true);
    expect(result.entitlement?.tier).toBe('digital-representative');
  });

  it('rejects an invalid signature', () => {
    const entitlement = signTestEntitlement(validUnsignedEntitlement());
    entitlement.signature = 'ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const result = verifySignedEntitlementV1(entitlement);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('rejects reservation JWTs as entitlement', async () => {
    const service = createService();
    const result = await service.activate(VALID_TOKEN_SEAT_1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Reservation artifacts never grant paid entitlement');
    expect(await service.getSnapshot()).toBeNull();
  });

  it('adapts a valid legacy sem_ key into a SignedEntitlementV1 snapshot', async () => {
    const futureExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const semKey = generateTestLicenseKey({
      tier: 'digital-representative',
      exp: futureExp,
      sub: 'paid-customer',
    });

    const adapted = adaptLegacySemKey(semKey);
    expect(adapted.ok).toBe(true);
    expect(adapted.entitlement?.signature.startsWith('legacy-sem:')).toBe(true);

    const service = createService();
    const activation = await service.activate(semKey);
    expect(activation.success).toBe(true);
    expect(activation.snapshot?.active).toBe(true);
    expect(activation.snapshot?.tier).toBe('digital-representative');

    const snapshot = await service.getSnapshot();
    expect(snapshot?.active).toBe(true);
    expect(snapshot?.entitlement.memberId).toBe('paid-customer');
  });
});

describe('kernel subscription grace', () => {
  it('keeps subscription active during offline grace after validUntil', () => {
    const validUntil = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const grace = evaluateSubscriptionGrace(
      { validUntil, offlineGraceDays: 30 },
      Date.now(),
    );
    expect(grace.active).toBe(true);
    expect(grace.inGracePeriod).toBe(true);
    expect(grace.expired).toBe(false);
  });

  it('expires subscription after grace window elapses', () => {
    const validUntil = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const grace = evaluateSubscriptionGrace(
      { validUntil, offlineGraceDays: 30 },
      Date.now(),
    );
    expect(grace.active).toBe(false);
    expect(grace.expired).toBe(true);
  });

  it('deactivates snapshot when grace has elapsed', async () => {
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const entitlement = signTestEntitlement(validUnsignedEntitlement({ validUntil, offlineGraceDays: 30 }));
    const service = createService();
    await service.activate(entitlement);

    const expiredNow = Date.parse(validUntil) + (31 * 24 * 60 * 60 * 1000);
    const snapshot = await service.getSnapshot(expiredNow);
    expect(snapshot?.active).toBe(false);
    expect(snapshot?.inGracePeriod).toBe(false);
  });
});

describe('kernel entitlement revocation', () => {
  it('marks entitlement inactive after local revoke', async () => {
    const entitlement = signTestEntitlement(validUnsignedEntitlement());
    const service = createService();
    await service.activate(entitlement);
    expect((await service.getSnapshot())?.active).toBe(true);

    await service.revokeLocalEntitlement();
    expect(await service.getSnapshot()).toBeNull();
  });

  it('isRevoked reflects persisted revocation state', async () => {
    const keyStore = createMemoryKeyStore();
    const entitlement = signTestEntitlement(validUnsignedEntitlement());
    await revokeEntitlement(keyStore, entitlement);
    expect(await isRevoked(keyStore, entitlement)).toBe(true);
  });
});

describe('kernel device enrollment limits', () => {
  it('enrolls the current device on activation', async () => {
    const service = createService('device-a');
    const entitlement = signTestEntitlement(validUnsignedEntitlement({ entitlementId: 'ent-device-a' }));
    const activation = await service.activate(entitlement);
    expect(activation.success).toBe(true);
    expect(activation.snapshot?.deviceEnrolled).toBe(true);
  });

  it('blocks activation on a fourth distinct device', async () => {
    const keyStore = createMemoryKeyStore();
    const entitlementId = 'ent-device-limit';
    const entitlement = signTestEntitlement(validUnsignedEntitlement({ entitlementId }));

    for (let index = 0; index < MAX_ENROLLED_DEVICES; index += 1) {
      await enrollDevice(keyStore, entitlementId, `device-${index}`);
    }

    const blocked = createEntitlementService(keyStore, { deviceId: 'device-overflow' });
    const result = await blocked.activate(entitlement);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Device limit reached');
  });

  it('supports transfer and removal of enrolled devices', async () => {
    const keyStore = createMemoryKeyStore();
    const entitlementId = 'ent-transfer';
    await enrollDevice(keyStore, entitlementId, 'device-old');
    await transferDeviceEnrollment(keyStore, entitlementId, 'device-old', 'device-new');
    expect(await isDeviceEnrolled(keyStore, entitlementId, 'device-new')).toBe(true);
    expect(await isDeviceEnrolled(keyStore, entitlementId, 'device-old')).toBe(false);

    await removeEnrolledDevice(keyStore, entitlementId, 'device-new');
    expect(await isDeviceEnrolled(keyStore, entitlementId, 'device-new')).toBe(false);
  });
});

describe('reservation never grants premium', () => {
  it('reservation import result remains reservation_only without activation', async () => {
    const service = createService();
    const reservationPaths = [
      VALID_TOKEN_SEAT_1,
      `semblance://reservation/import?token=${encodeURIComponent(VALID_TOKEN_SEAT_1)}`,
    ];

    for (const bearer of reservationPaths) {
      const result = await service.activate(bearer);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Reservation artifacts never grant paid entitlement');
    }

    expect(await service.getSnapshot()).toBeNull();
  });
});

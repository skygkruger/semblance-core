import { createPrivateKey, sign } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SignedEntitlementV1 } from '@semblance/protocol';
import { createMemoryKeyStore } from '../src/keys/memory-key-store.js';
import { createEntitlementService } from '../src/entitlement/service.js';
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
    const keyStore = createMemoryKeyStore();
    const service = createEntitlementService(keyStore);
    const result = await service.activate(VALID_TOKEN_SEAT_1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Reservation artifacts never grant paid entitlement');
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

    const keyStore = createMemoryKeyStore();
    const service = createEntitlementService(keyStore);
    const activation = await service.activate(semKey);
    expect(activation.success).toBe(true);
    expect(activation.snapshot?.active).toBe(true);
    expect(activation.snapshot?.tier).toBe('digital-representative');

    const snapshot = await service.getSnapshot();
    expect(snapshot?.active).toBe(true);
    expect(snapshot?.entitlement.memberId).toBe('paid-customer');
  });
});

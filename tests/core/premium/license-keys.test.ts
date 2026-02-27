/**
 * License key Ed25519 signature verification tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { verifyLicenseKeySignature, setLicensePublicKey } from '@semblance/core/premium/license-keys';
import {
  LICENSE_TEST_PUBLIC_KEY_PEM,
  validDRKey,
  validLifetimeKey,
  tamperedKey,
  generateTestLicenseKey,
} from '../../fixtures/license-keys';

// Wrong keypair — different from the test keypair, will fail verification
import { generateKeyPairSync } from 'node:crypto';
const wrongKeypair = generateKeyPairSync('ed25519');
const WRONG_PUBLIC_KEY_PEM = wrongKeypair.publicKey.export({ type: 'spki', format: 'pem' }) as string;

beforeAll(() => {
  // Inject the test public key so fixture-signed keys verify
  setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
});

describe('verifyLicenseKeySignature', () => {
  it('valid digital-representative key verifies', () => {
    const key = validDRKey();
    const result = verifyLicenseKeySignature(key);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('valid lifetime key verifies', () => {
    const key = validLifetimeKey();
    const result = verifyLicenseKeySignature(key);
    expect(result.valid).toBe(true);
  });

  it('tampered payload fails verification', () => {
    const key = tamperedKey();
    const result = verifyLicenseKeySignature(key);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature verification failed');
  });

  it('wrong public key fails verification', () => {
    // Temporarily use the wrong key
    setLicensePublicKey(WRONG_PUBLIC_KEY_PEM);
    const key = validDRKey();
    const result = verifyLicenseKeySignature(key);
    expect(result.valid).toBe(false);
    // Restore correct key
    setLicensePublicKey(LICENSE_TEST_PUBLIC_KEY_PEM);
  });

  it('rejects key without sem_ prefix', () => {
    const result = verifyLicenseKeySignature('invalid_key');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must start with sem_');
  });

  it('rejects key with wrong segment count', () => {
    const result = verifyLicenseKeySignature('sem_only.two');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('3 dot-separated segments');
  });

  it('rejects key with wrong header type', () => {
    // Generate a key with JWT type instead of LIC
    const key = generateTestLicenseKey({ tier: 'digital-representative' });
    // Manually replace header to have typ: JWT
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const parts = key.slice(4).split('.');
    const modified = `sem_${header}.${parts[1]}.${parts[2]}`;
    const result = verifyLicenseKeySignature(modified);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expected type 'LIC'");
  });

  it('rejects completely invalid base64 header', () => {
    const result = verifyLicenseKeySignature('sem_!!!.!!!.!!!');
    expect(result.valid).toBe(false);
  });
});

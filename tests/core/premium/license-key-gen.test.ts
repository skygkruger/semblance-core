// Tests for license key generation utilities — signing, decoding, keypair generation.
// Uses the shared utilities from scripts/license-key-utils.ts and verifies
// generated keys against the verification module in packages/core/premium/license-keys.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTestKeypair,
  generateLicenseKey,
  derivePublicKey,
  decodeLicensePayload,
  base64urlEncode,
  base64urlDecode,
} from '../../../scripts/license-key-utils.js';
import {
  verifyLicenseKeySignature,
  setLicensePublicKey,
} from '@semblance/core/premium/license-keys.js';

// ─── generateTestKeypair ────────────────────────────────────────────────────

describe('generateTestKeypair', () => {
  it('produces valid PEM keys', () => {
    const keypair = generateTestKeypair();

    expect(keypair.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(keypair.publicKeyPem).toContain('-----END PUBLIC KEY-----');
    expect(keypair.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
    expect(keypair.privateKeyPem).toContain('-----END PRIVATE KEY-----');
  });

  it('produces different keypairs on each call', () => {
    const kp1 = generateTestKeypair();
    const kp2 = generateTestKeypair();

    expect(kp1.publicKeyPem).not.toBe(kp2.publicKeyPem);
    expect(kp1.privateKeyPem).not.toBe(kp2.privateKeyPem);
  });
});

// ─── generateLicenseKey ─────────────────────────────────────────────────────

describe('generateLicenseKey', () => {
  let privateKeyPem: string;

  beforeEach(() => {
    const keypair = generateTestKeypair();
    privateKeyPem = keypair.privateKeyPem;
  });

  it('produces key starting with sem_', () => {
    const result = generateLicenseKey(privateKeyPem, { tier: 'founding' });
    expect(result.key.startsWith('sem_')).toBe(true);
  });

  it('produces key with 3 dot-separated segments after sem_ prefix', () => {
    const result = generateLicenseKey(privateKeyPem, { tier: 'digital-representative' });
    const withoutPrefix = result.key.slice(4); // Remove 'sem_'
    const segments = withoutPrefix.split('.');

    expect(segments).toHaveLength(3);
    // Each segment should be non-empty base64url
    for (const segment of segments) {
      expect(segment.length).toBeGreaterThan(0);
    }
  });

  it('generated key verifies against derived public key', () => {
    const keypair = generateTestKeypair();
    const result = generateLicenseKey(keypair.privateKeyPem, { tier: 'founding' });

    // Inject the matching public key into the verification module
    const publicKeyPem = derivePublicKey(keypair.privateKeyPem);
    setLicensePublicKey(publicKeyPem);

    const verification = verifyLicenseKeySignature(result.key);
    expect(verification.valid).toBe(true);
    expect(verification.error).toBeUndefined();
  });

  it('verification fails with wrong public key', () => {
    const keypairA = generateTestKeypair();
    const keypairB = generateTestKeypair();

    const result = generateLicenseKey(keypairA.privateKeyPem, { tier: 'founding' });

    // Inject a DIFFERENT public key — signature should fail
    setLicensePublicKey(keypairB.publicKeyPem);

    const verification = verifyLicenseKeySignature(result.key);
    expect(verification.valid).toBe(false);
  });

  it('includes seat number in founding key', () => {
    const result = generateLicenseKey(privateKeyPem, {
      tier: 'founding',
      seat: 42,
    });

    expect(result.payload.seat).toBe(42);
    expect(result.payload.tier).toBe('founding');
  });

  it('includes exp field when expiresInDays is set', () => {
    const result = generateLicenseKey(privateKeyPem, {
      tier: 'digital-representative',
      expiresInDays: 365,
    });

    expect(result.payload.exp).toBeDefined();
    // exp should be iat + 365 days in seconds
    expect(result.payload.exp).toBe(result.payload.iat + 365 * 86400);
  });

  it('does not include exp field when expiresInDays is not set', () => {
    const result = generateLicenseKey(privateKeyPem, { tier: 'lifetime' });

    expect(result.payload.exp).toBeUndefined();
  });
});

// ─── decodeLicensePayload ───────────────────────────────────────────────────

describe('decodeLicensePayload', () => {
  let privateKeyPem: string;

  beforeEach(() => {
    const keypair = generateTestKeypair();
    privateKeyPem = keypair.privateKeyPem;
  });

  it('returns correct tier from generated key', () => {
    const result = generateLicenseKey(privateKeyPem, { tier: 'founding' });
    const decoded = decodeLicensePayload(result.key);

    expect(decoded).not.toBeNull();
    expect(decoded!.tier).toBe('founding');
  });

  it('returns null for invalid keys — no sem_ prefix', () => {
    const decoded = decodeLicensePayload('invalid-key-without-prefix');
    expect(decoded).toBeNull();
  });

  it('returns null for invalid keys — wrong number of segments', () => {
    const decoded = decodeLicensePayload('sem_only-one-segment');
    expect(decoded).toBeNull();
  });

  it('returns null for invalid keys — corrupt base64', () => {
    const decoded = decodeLicensePayload('sem_!!invalid!!.!!base64!!.!!data!!');
    expect(decoded).toBeNull();
  });

  it('returns correct fields including seat and exp', () => {
    const result = generateLicenseKey(privateKeyPem, {
      tier: 'founding',
      seat: 7,
      expiresInDays: 30,
      subject: 'test-user-123',
    });

    const decoded = decodeLicensePayload(result.key);

    expect(decoded).not.toBeNull();
    expect(decoded!.tier).toBe('founding');
    expect(decoded!.seat).toBe(7);
    expect(decoded!.exp).toBeDefined();
    expect(decoded!.sub).toBe('test-user-123');
    expect(decoded!.iat).toBeGreaterThan(0);
  });
});

// ─── derivePublicKey ────────────────────────────────────────────────────────

describe('derivePublicKey', () => {
  it('extracts matching public key from private key', () => {
    const keypair = generateTestKeypair();
    const derived = derivePublicKey(keypair.privateKeyPem);

    expect(derived).toBe(keypair.publicKeyPem);
  });
});

// ─── base64url encoding roundtrip ───────────────────────────────────────────

describe('base64url encode/decode', () => {
  it('roundtrips arbitrary data', () => {
    const original = 'Hello, license key world! Special chars: +/= 🔑';
    const encoded = base64urlEncode(original);

    // base64url should not contain +, /, or =
    expect(encoded).not.toMatch(/[+/=]/);

    const decoded = base64urlDecode(encoded).toString('utf-8');
    expect(decoded).toBe(original);
  });
});

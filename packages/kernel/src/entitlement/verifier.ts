import { createPublicKey, verify } from 'node:crypto';
import { SignedEntitlementV1 as SignedEntitlementSchema, type SignedEntitlementV1 } from '@semblance/protocol';
import { entitlementSigningPayload } from './signing-payload.js';
import { LEGACY_SEM_SIGNATURE_PREFIX } from './legacy-adapter.js';

export const LEGACY_SEM_ISSUER_KEY_ID = 'semblance-license-v1';
export const DEFAULT_ENTITLEMENT_ISSUER_KEY_ID = 'semblance-issuer-v1';

const TEST_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATestLicenseKeyPublicForUnitTestsOnly00=
-----END PUBLIC KEY-----`;

const PRODUCTION_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjZLwfE5cpkjYZF0kVoOvR3FzySjU1NNOezrQSgtimkU=
-----END PUBLIC KEY-----`;

const defaultLicensePublicKeyPem =
  process.env.NODE_ENV === 'test' ? TEST_LICENSE_PUBLIC_KEY_PEM : PRODUCTION_LICENSE_PUBLIC_KEY_PEM;

const issuerPublicKeys = new Map<string, string>([
  [DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, defaultLicensePublicKeyPem],
  [LEGACY_SEM_ISSUER_KEY_ID, defaultLicensePublicKeyPem],
]);

export function setEntitlementIssuerPublicKey(keyId: string, pem: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setEntitlementIssuerPublicKey is test-only');
  }
  issuerPublicKeys.set(keyId, pem);
}

export function resetEntitlementIssuerPublicKeysForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetEntitlementIssuerPublicKeysForTests is test-only');
  }
  issuerPublicKeys.clear();
  issuerPublicKeys.set(DEFAULT_ENTITLEMENT_ISSUER_KEY_ID, defaultLicensePublicKeyPem);
  issuerPublicKeys.set(LEGACY_SEM_ISSUER_KEY_ID, defaultLicensePublicKeyPem);
}

function base64urlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding === 2) base64 += '==';
  else if (padding === 3) base64 += '=';
  return Buffer.from(base64, 'base64');
}

function decodeEd25519Signature(signature: string): Buffer {
  const prefix = 'ed25519:';
  if (!signature.startsWith(prefix)) {
    throw new Error('Unsupported entitlement signature encoding');
  }
  return Buffer.from(signature.slice(prefix.length), 'base64url');
}

export interface EntitlementVerification {
  valid: boolean;
  entitlement?: SignedEntitlementV1;
  error?: string;
}

export interface LegacySemLicensePayload {
  tier: 'founding' | 'digital-representative' | 'lifetime';
  sub: string;
  exp: string | null;
  seat: number | null;
}

export interface LegacySemLicenseValidation extends EntitlementVerification {
  payload?: LegacySemLicensePayload;
}

export function verifyLegacySemKeySignature(key: string): EntitlementVerification {
  if (!key.startsWith('sem_')) {
    return { valid: false, error: 'Invalid key: must start with sem_' };
  }

  const withoutPrefix = key.slice(4);
  const segments = withoutPrefix.split('.');

  if (segments.length !== 3) {
    return { valid: false, error: 'Invalid key: expected 3 dot-separated segments' };
  }

  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string];

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf-8'));
  } catch {
    return { valid: false, error: 'Invalid key: could not decode header' };
  }

  if (header.alg !== 'EdDSA') {
    return { valid: false, error: `Invalid key: unsupported algorithm '${header.alg}'` };
  }

  if (header.typ !== 'LIC') {
    return { valid: false, error: `Invalid key: expected type 'LIC', got '${header.typ}'` };
  }

  const publicKeyPem = issuerPublicKeys.get(LEGACY_SEM_ISSUER_KEY_ID) ?? defaultLicensePublicKeyPem;

  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(signatureB64);

    const isValid = verify(null, signingInput, publicKey, signature);
    if (!isValid) {
      return { valid: false, error: 'Invalid key: signature verification failed' };
    }
  } catch {
    return { valid: false, error: 'Invalid key: signature verification failed' };
  }

  return { valid: true };
}

export function validateLegacySemLicenseKey(
  key: string,
  nowMs = Date.now(),
): LegacySemLicenseValidation {
  const signature = verifyLegacySemKeySignature(key);
  if (!signature.valid) return signature;

  let value: unknown;
  try {
    const payloadSegment = key.slice(4).split('.')[1];
    if (!payloadSegment) {
      return { valid: false, error: 'Invalid key: missing payload' };
    }
    value = JSON.parse(base64urlDecode(payloadSegment).toString('utf8'));
  } catch {
    return { valid: false, error: 'Invalid key: could not decode payload' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'Invalid key: payload must be an object' };
  }
  const payload = value as Record<string, unknown>;
  const tier = payload.tier;
  if (
    tier !== 'founding'
    && tier !== 'digital-representative'
    && tier !== 'lifetime'
  ) {
    return { valid: false, error: `Invalid license tier: ${String(tier)}` };
  }
  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return { valid: false, error: 'Invalid key: subject is required' };
  }

  if (tier === 'digital-representative') {
    if (typeof payload.exp !== 'string') {
      return { valid: false, error: 'Invalid key: subscription expiration is required' };
    }
    const expirationMs = Date.parse(payload.exp);
    if (!Number.isFinite(expirationMs) || new Date(expirationMs).toISOString() !== payload.exp) {
      return { valid: false, error: 'Invalid expiration date in license key' };
    }
    if (expirationMs <= nowMs) {
      return { valid: false, error: 'License key has expired' };
    }
    if (payload.seat !== undefined) {
      return { valid: false, error: 'Invalid key: subscription keys cannot contain a seat' };
    }
    return {
      valid: true,
      payload: { tier, sub: payload.sub, exp: payload.exp, seat: null },
    };
  }

  if (payload.exp !== undefined) {
    return { valid: false, error: `Invalid key: ${tier} keys cannot expire` };
  }
  if (tier === 'founding') {
    if (!Number.isSafeInteger(payload.seat) || (payload.seat as number) <= 0) {
      return { valid: false, error: 'Invalid key: founding seat must be a positive integer' };
    }
    return {
      valid: true,
      payload: { tier, sub: payload.sub, exp: null, seat: payload.seat as number },
    };
  }
  if (payload.seat !== undefined) {
    return { valid: false, error: 'Invalid key: lifetime keys cannot contain a seat' };
  }
  return {
    valid: true,
    payload: { tier, sub: payload.sub, exp: null, seat: null },
  };
}

function verifySignedEntitlementSignature(entitlement: SignedEntitlementV1): EntitlementVerification {
  if (entitlement.signature.startsWith(LEGACY_SEM_SIGNATURE_PREFIX)) {
    const embeddedKey = entitlement.signature.slice(LEGACY_SEM_SIGNATURE_PREFIX.length);
    const validation = validateLegacySemLicenseKey(embeddedKey);
    if (!validation.valid) {
      return { valid: false, error: validation.error ?? 'Legacy license key verification failed' };
    }
    return { valid: true, entitlement };
  }

  const publicKeyPem = issuerPublicKeys.get(entitlement.issuerKeyId);
  if (!publicKeyPem) {
    return { valid: false, error: `Unknown entitlement issuer "${entitlement.issuerKeyId}"` };
  }

  try {
    const { signature, ...unsigned } = entitlement;
    const payload = entitlementSigningPayload(unsigned);
    const publicKey = createPublicKey(publicKeyPem);
    const signatureBytes = decodeEd25519Signature(signature);
    const isValid = verify(null, Buffer.from(payload, 'utf8'), publicKey, signatureBytes);
    if (!isValid) {
      return { valid: false, error: 'Invalid entitlement: signature verification failed' };
    }
  } catch {
    return { valid: false, error: 'Invalid entitlement: signature verification failed' };
  }

  return { valid: true, entitlement };
}

function validateEntitlementWindow(
  entitlement: SignedEntitlementV1,
  nowMs: number,
): EntitlementVerification {
  const validFromMs = Date.parse(entitlement.validFrom);
  if (!Number.isFinite(validFromMs)) {
    return { valid: false, error: 'Invalid entitlement: validFrom is not a canonical timestamp' };
  }
  if (validFromMs > nowMs) {
    return { valid: false, error: 'Entitlement is not yet valid' };
  }

  if (entitlement.validUntil === null) {
    return { valid: true, entitlement };
  }

  const validUntilMs = Date.parse(entitlement.validUntil);
  if (!Number.isFinite(validUntilMs) || new Date(validUntilMs).toISOString() !== entitlement.validUntil) {
    return { valid: false, error: 'Invalid entitlement: validUntil is not a canonical timestamp' };
  }

  const graceMs = entitlement.offlineGraceDays * 24 * 60 * 60 * 1000;
  if (validUntilMs + graceMs <= nowMs) {
    return { valid: false, error: 'Entitlement has expired' };
  }

  return { valid: true, entitlement };
}

export function verifySignedEntitlementV1(
  value: unknown,
  nowMs = Date.now(),
): EntitlementVerification {
  let entitlement: SignedEntitlementV1;
  try {
    entitlement = SignedEntitlementSchema.parse(value);
  } catch {
    return { valid: false, error: 'Invalid entitlement: schema validation failed' };
  }

  const signatureResult = verifySignedEntitlementSignature(entitlement);
  if (!signatureResult.valid) {
    return signatureResult;
  }

  return validateEntitlementWindow(entitlement, nowMs);
}

export function isEntitlementCurrentlyActive(
  entitlement: SignedEntitlementV1,
  nowMs = Date.now(),
): boolean {
  return verifySignedEntitlementV1(entitlement, nowMs).valid;
}

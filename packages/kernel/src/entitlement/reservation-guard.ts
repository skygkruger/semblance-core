import { createPublicKey, verify } from 'node:crypto';

const TEST_RESERVATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAAeOrN1OgTzVAT9Y9LtGqnpR8/bYEdayuEMtSi9gqK1c=
-----END PUBLIC KEY-----`;

const PRODUCTION_RESERVATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjdSpFw84m5aJU+Qa8vXlGFS4IQRZW1s/sAfMbKl4/rI=
-----END PUBLIC KEY-----`;

let reservationPublicKeyPem =
  process.env.NODE_ENV === 'test'
    ? TEST_RESERVATION_PUBLIC_KEY_PEM
    : PRODUCTION_RESERVATION_PUBLIC_KEY_PEM;

export function setReservationPublicKeyForTests(pem: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setReservationPublicKeyForTests is test-only');
  }
  reservationPublicKeyPem = pem;
}

function base64urlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding === 2) base64 += '==';
  else if (padding === 3) base64 += '=';
  return Buffer.from(base64, 'base64');
}

function looksLikeJwt(bearer: string): boolean {
  const trimmed = bearer.trim();
  if (trimmed.startsWith('sem_')) {
    return false;
  }
  const segments = trimmed.split('.');
  return segments.length === 3 && segments.every((segment) => segment.length > 0);
}

function verifyReservationJwtSignature(token: string): boolean {
  const segments = token.trim().split('.');
  if (segments.length !== 3) {
    return false;
  }

  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string];

  let header: { alg?: string };
  try {
    header = JSON.parse(base64urlDecode(headerB64).toString('utf8')) as { alg?: string };
  } catch {
    return false;
  }

  if (header.alg !== 'EdDSA') {
    return false;
  }

  try {
    const publicKey = createPublicKey(reservationPublicKeyPem);
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(signatureB64);
    return verify(null, signingInput, publicKey, signature);
  } catch {
    return false;
  }
}

/**
 * Reservation JWTs and waitlist artifacts prove reservation only — never paid entitlement.
 */
export function isReservationArtifact(bearer: string): boolean {
  const trimmed = bearer.trim();
  if (!looksLikeJwt(trimmed)) {
    return false;
  }
  return verifyReservationJwtSignature(trimmed);
}

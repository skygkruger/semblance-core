import { createHash, createHmac, sign, timingSafeEqual } from 'node:crypto';

export type ReceiptSignatureAlgorithm = 'hmac-sha256' | 'ed25519';

export interface ReceiptSignature {
  readonly algorithm: ReceiptSignatureAlgorithm;
  readonly value: string;
}

export function canonicalizeRecord(record: Record<string, unknown>): string {
  const ordered = Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = record[key] ?? null;
      return acc;
    }, {});
  return JSON.stringify(ordered);
}

export function digestCanonical(canonical: string): Buffer {
  return createHash('sha256').update(canonical, 'utf8').digest();
}

export function signDigest(
  digest: Buffer,
  signingKey: Buffer,
  algorithm: ReceiptSignatureAlgorithm,
): string {
  if (algorithm === 'hmac-sha256') {
    return createHmac('sha256', signingKey).update(digest).digest('hex');
  }
  return sign(null, digest, signingKey).toString('hex');
}

export function verifyDigestSignature(
  digest: Buffer,
  signature: ReceiptSignature,
  signingKey: Buffer,
): boolean {
  const expected = signDigest(digest, signingKey, signature.algorithm);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature.value, 'hex');
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

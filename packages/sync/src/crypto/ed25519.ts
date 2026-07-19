import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';

const KEY_PREFIX = 'ed25519:';

export interface Ed25519KeyMaterial {
  readonly privateKey: string;
  readonly publicKey: string;
}

export function generateEd25519KeyMaterial(): Ed25519KeyMaterial {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: `${KEY_PREFIX}${privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url')}`,
    publicKey: `${KEY_PREFIX}${publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')}`,
  };
}

function decodePrivateKey(encoded: string): Buffer {
  if (!encoded.startsWith(KEY_PREFIX)) {
    throw new Error('Unsupported Ed25519 private key encoding');
  }
  return Buffer.from(encoded.slice(KEY_PREFIX.length), 'base64url');
}

function decodePublicKey(encoded: string): Buffer {
  if (!encoded.startsWith(KEY_PREFIX)) {
    throw new Error('Unsupported Ed25519 public key encoding');
  }
  return Buffer.from(encoded.slice(KEY_PREFIX.length), 'base64url');
}

export function signPayload(payload: string, privateKeyEncoded: string): string {
  const privateKey = createPrivateKey({
    key: decodePrivateKey(privateKeyEncoded),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return `${KEY_PREFIX}${signature.toString('base64url')}`;
}

export function verifyPayload(payload: string, signatureEncoded: string, publicKeyEncoded: string): boolean {
  if (!signatureEncoded.startsWith(KEY_PREFIX)) {
    return false;
  }
  try {
    const publicKey = createPublicKey({
      key: decodePublicKey(publicKeyEncoded),
      format: 'der',
      type: 'spki',
    });
    const signature = Buffer.from(signatureEncoded.slice(KEY_PREFIX.length), 'base64url');
    return verify(null, Buffer.from(payload, 'utf8'), publicKey, signature);
  } catch {
    return false;
  }
}

export function hashHex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
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

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { SyncSecureStorageAdapter } from './secure-storage.js';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HKDF_INFO = 'semblance-sync-domain-aes-256-gcm-v1';
const CIPHERTEXT_PREFIX = 'sync-aes256gcm:';

export function domainKeyStorageKey(domainId: string): string {
  return `sync.domain.${domainId}.masterKey`;
}

export function domainEpochStorageKey(domainId: string, membershipEpoch: number): string {
  return `sync.domain.${domainId}.epoch.${membershipEpoch}`;
}

export async function getOrCreateDomainMasterKey(
  secureStorage: SyncSecureStorageAdapter,
  domainId: string,
): Promise<Buffer> {
  const storageKey = domainKeyStorageKey(domainId);
  const existing = await secureStorage.get(storageKey);
  if (existing) {
    return Buffer.from(existing, 'hex');
  }

  const masterKey = randomBytes(KEY_LENGTH);
  await secureStorage.set(storageKey, masterKey.toString('hex'));
  return masterKey;
}

export function deriveEpochBoundDomainKey(masterKey: Buffer, membershipEpoch: number): Buffer {
  if (masterKey.length !== KEY_LENGTH) {
    throw new Error(`Domain master key must be ${KEY_LENGTH} bytes`);
  }

  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from(`semblance-sync-domain-epoch:${membershipEpoch}`, 'utf-8'),
      HKDF_INFO,
      KEY_LENGTH,
    ),
  );
}

export function encryptWithDomainKey(plaintext: string, domainKey: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, domainKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return `${CIPHERTEXT_PREFIX}${packed.toString('base64')}`;
}

export function decryptWithDomainKey(ciphertext: string, domainKey: Buffer): string {
  if (!ciphertext.startsWith(CIPHERTEXT_PREFIX)) {
    throw new Error('Unsupported sync ciphertext format');
  }

  const packed = Buffer.from(ciphertext.slice(CIPHERTEXT_PREFIX.length), 'base64');
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid sync ciphertext: too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(AES_ALGORITHM, domainKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

export async function rotateDomainKeyForEpoch(
  secureStorage: SyncSecureStorageAdapter,
  domainId: string,
  membershipEpoch: number,
): Promise<Buffer> {
  const masterKey = await getOrCreateDomainMasterKey(secureStorage, domainId);
  const epochKey = deriveEpochBoundDomainKey(masterKey, membershipEpoch);
  await secureStorage.set(domainEpochStorageKey(domainId, membershipEpoch), epochKey.toString('hex'));
  return epochKey;
}

export async function loadEpochBoundDomainKey(
  secureStorage: SyncSecureStorageAdapter,
  domainId: string,
  membershipEpoch: number,
): Promise<Buffer> {
  const cached = await secureStorage.get(domainEpochStorageKey(domainId, membershipEpoch));
  if (cached) {
    return Buffer.from(cached, 'hex');
  }

  return rotateDomainKeyForEpoch(secureStorage, domainId, membershipEpoch);
}

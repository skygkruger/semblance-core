import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import type { SharedSpaceSecureStorage } from '../secure-storage.js';

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SHARED_CIPHERTEXT_PREFIX = 'shared-aes256gcm:';
const PERSONAL_CIPHERTEXT_PREFIX = 'personal-aes256gcm:';

export function sharedSpaceDomainMasterKey(sharedSpaceId: string, domainId: string): string {
  return `sharedSpace.${sharedSpaceId}.domain.${domainId}.masterKey`;
}

export function sharedSpaceDomainEpochKey(
  sharedSpaceId: string,
  domainId: string,
  membershipEpoch: number,
): string {
  return `sharedSpace.${sharedSpaceId}.domain.${domainId}.epoch.${membershipEpoch}`;
}

export function sharedSpaceRootPrivateKey(sharedSpaceId: string): string {
  return `sharedSpace.${sharedSpaceId}.rootPrivateKey`;
}

export function sharedSpaceRootPublicKey(sharedSpaceId: string): string {
  return `sharedSpace.${sharedSpaceId}.rootPublicKey`;
}

export function sharedSpaceRecoverySecretKey(sharedSpaceId: string): string {
  return `sharedSpace.${sharedSpaceId}.recoverySecret`;
}

export function sharedSpaceMemberEnrollmentKey(sharedSpaceId: string, memberId: string): string {
  return `sharedSpace.${sharedSpaceId}.member.${memberId}.enrollmentPrivateKey`;
}

function deriveEpochBoundKey(masterKey: Buffer, membershipEpoch: number, info: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from(`shared-space-epoch:${membershipEpoch}`, 'utf-8'),
      info,
      KEY_LENGTH,
    ),
  );
}

export function deriveSharedDomainEpochKey(masterKey: Buffer, membershipEpoch: number): Buffer {
  return deriveEpochBoundKey(masterKey, membershipEpoch, 'semblance-shared-space-domain-aes-256-gcm-v1');
}

export function derivePersonalVaultWrapKey(personalRootPrivateKey: string, memberId: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(personalRootPrivateKey, 'utf-8'),
      Buffer.from(`personal-root:${memberId}`, 'utf-8'),
      'semblance-personal-vault-wrap-aes-256-gcm-v1',
      KEY_LENGTH,
    ),
  );
}

function encryptAesGcm(plaintext: string, key: Buffer, prefix: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return `${prefix}${packed.toString('base64')}`;
}

function decryptAesGcm(ciphertext: string, key: Buffer, prefix: string): string {
  if (!ciphertext.startsWith(prefix)) {
    throw new Error('Unsupported ciphertext format');
  }
  const packed = Buffer.from(ciphertext.slice(prefix.length), 'base64');
  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid ciphertext: too short');
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf-8');
}

export function encryptSharedEnvelope(plaintext: string, domainKey: Buffer): string {
  return encryptAesGcm(plaintext, domainKey, SHARED_CIPHERTEXT_PREFIX);
}

export function decryptSharedEnvelope(ciphertext: string, domainKey: Buffer): string {
  return decryptAesGcm(ciphertext, domainKey, SHARED_CIPHERTEXT_PREFIX);
}

export function sealPersonalKeyMaterial(
  memberId: string,
  personalRootPrivateKey: string,
  personalVaultKeyHex: string,
): string {
  const wrapKey = derivePersonalVaultWrapKey(personalRootPrivateKey, memberId);
  return encryptAesGcm(personalVaultKeyHex, wrapKey, PERSONAL_CIPHERTEXT_PREFIX);
}

export function openPersonalKeyMaterial(
  memberId: string,
  personalRootPrivateKey: string,
  sealedEnvelope: string,
): string {
  const wrapKey = derivePersonalVaultWrapKey(personalRootPrivateKey, memberId);
  return decryptAesGcm(sealedEnvelope, wrapKey, PERSONAL_CIPHERTEXT_PREFIX);
}

export function encryptMasterKeyForMember(
  masterKeyHex: string,
  memberEnrollmentPrivateKey: string,
  memberId: string,
): string {
  const wrapKey = derivePersonalVaultWrapKey(memberEnrollmentPrivateKey, `${memberId}:shared-enrollment`);
  return encryptAesGcm(masterKeyHex, wrapKey, SHARED_CIPHERTEXT_PREFIX);
}

export function decryptMasterKeyForMember(
  encryptedMasterKey: string,
  memberEnrollmentPrivateKey: string,
  memberId: string,
): string {
  const wrapKey = derivePersonalVaultWrapKey(memberEnrollmentPrivateKey, `${memberId}:shared-enrollment`);
  return decryptAesGcm(encryptedMasterKey, wrapKey, SHARED_CIPHERTEXT_PREFIX);
}

export async function getOrCreateSharedDomainMasterKey(
  secureStorage: SharedSpaceSecureStorage,
  sharedSpaceId: string,
  domainId: string,
): Promise<Buffer> {
  const storageKey = sharedSpaceDomainMasterKey(sharedSpaceId, domainId);
  const existing = await secureStorage.get(storageKey);
  if (existing) {
    return Buffer.from(existing, 'hex');
  }
  const masterKey = randomBytes(KEY_LENGTH);
  await secureStorage.set(storageKey, masterKey.toString('hex'));
  return masterKey;
}

export async function rotateSharedDomainMasterKey(
  secureStorage: SharedSpaceSecureStorage,
  sharedSpaceId: string,
  domainId: string,
): Promise<{ priorFingerprint: string; newFingerprint: string; masterKey: Buffer }> {
  const storageKey = sharedSpaceDomainMasterKey(sharedSpaceId, domainId);
  const prior = await secureStorage.get(storageKey);
  const priorFingerprint = prior ? createHash('sha256').update(Buffer.from(prior, 'hex')).digest('hex') : hashEmpty();
  const masterKey = randomBytes(KEY_LENGTH);
  await secureStorage.set(storageKey, masterKey.toString('hex'));
  const newFingerprint = createHash('sha256').update(masterKey).digest('hex');
  return { priorFingerprint, newFingerprint, masterKey };
}

export async function loadSharedDomainEpochKey(
  secureStorage: SharedSpaceSecureStorage,
  sharedSpaceId: string,
  domainId: string,
  membershipEpoch: number,
): Promise<Buffer> {
  const epochKey = sharedSpaceDomainEpochKey(sharedSpaceId, domainId, membershipEpoch);
  const cached = await secureStorage.get(epochKey);
  if (cached) {
    return Buffer.from(cached, 'hex');
  }
  const masterKey = await getOrCreateSharedDomainMasterKey(secureStorage, sharedSpaceId, domainId);
  const derived = deriveSharedDomainEpochKey(masterKey, membershipEpoch);
  await secureStorage.set(epochKey, derived.toString('hex'));
  return derived;
}

function hashEmpty(): string {
  return createHash('sha256').update('').digest('hex');
}

export function hashRecoverySecret(secret: Buffer): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function createRecoverySecret(): Buffer {
  return randomBytes(32);
}

export function createSharedSpaceId(): string {
  return `sspace-${randomUUID()}`;
}

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const VAULT_DATA_DOMAINS = ['documents', 'agency', 'preferences'] as const;
export type VaultDataDomain = (typeof VAULT_DATA_DOMAINS)[number] | string;

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const HKDF_INFO = 'semblance-vault-domain-aes-256-gcm-v1';
const CIPHERTEXT_PREFIX = 'aes256gcm:';
export const REDACTED_PAYLOAD_CIPHERTEXT = 'redacted:';

export class DomainKeyStore {
  private readonly rootKey: Buffer;
  private readonly cache = new Map<string, Buffer>();

  constructor(rootKey: Buffer) {
    if (rootKey.length !== KEY_LENGTH) {
      throw new Error(`Vault root key must be ${KEY_LENGTH} bytes`);
    }
    this.rootKey = rootKey;
  }

  deriveDomainKey(domain: VaultDataDomain): Buffer {
    const normalized = domain.trim();
    if (normalized.length === 0) {
      throw new Error('Vault data domain must not be empty');
    }

    const cached = this.cache.get(normalized);
    if (cached) {
      return cached;
    }

    const domainKey = Buffer.from(
      hkdfSync(
        'sha256',
        this.rootKey,
        Buffer.from(`semblance-vault-domain:${normalized}`, 'utf-8'),
        HKDF_INFO,
        KEY_LENGTH,
      ),
    );
    this.cache.set(normalized, domainKey);
    return domainKey;
  }

  encryptPayload(domain: VaultDataDomain, plaintext: string): string {
    const key = this.deriveDomainKey(domain);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const packed = Buffer.concat([iv, authTag, encrypted]);

    return `${CIPHERTEXT_PREFIX}${packed.toString('base64')}`;
  }

  rotateDomainKey(domain: VaultDataDomain): Buffer {
    const normalized = domain.trim();
    if (normalized.length === 0) {
      throw new Error('Vault data domain must not be empty');
    }

    const rotated = randomBytes(KEY_LENGTH);
    this.cache.set(normalized, rotated);
    return rotated;
  }

  destroyCachedDomainKey(domain: VaultDataDomain): void {
    this.cache.delete(domain.trim());
  }

  decryptPayload(domain: VaultDataDomain, payloadCiphertext: string): string {
    if (payloadCiphertext === 'redacted:') {
      throw new Error('Vault payload was cryptographically erased');
    }

    if (!payloadCiphertext.startsWith(CIPHERTEXT_PREFIX)) {
      throw new Error('Unsupported vault payload ciphertext format');
    }

    const key = this.deriveDomainKey(domain);
    const packed = Buffer.from(payloadCiphertext.slice(CIPHERTEXT_PREFIX.length), 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new Error('Invalid vault payload ciphertext: too short');
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  }
}

export function deriveVaultSigningKey(rootKey: Buffer): Buffer {
  if (rootKey.length !== KEY_LENGTH) {
    throw new Error(`Vault root key must be ${KEY_LENGTH} bytes`);
  }

  return Buffer.from(
    hkdfSync(
      'sha256',
      rootKey,
      Buffer.from('semblance-vault-event-signing', 'utf-8'),
      'semblance-vault-event-signing-v1',
      KEY_LENGTH,
    ),
  );
}

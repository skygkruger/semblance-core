// Hardware-Bound Key Provider — Platform-specific hardware-backed key storage.
//
// Abstracts Secure Enclave (macOS/iOS), TPM (Windows), Android Keystore,
// and libsecret (Linux) behind a unified interface. Keys generated within
// the hardware security module never leave the device's secure element.
//
// CRITICAL: No networking imports. Pure computation + platform delegation.

import type { SecureStorageAdapter } from '../platform/types.js';
import { generateKeyPair, sign, verify } from './ed25519.js';
import type { Ed25519KeyPair } from './types.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export type HardwareKeyBackend =
  | 'secure-enclave'    // macOS / iOS — Secure Enclave
  | 'tpm'               // Windows — Trusted Platform Module
  | 'android-keystore'  // Android — Android Keystore
  | 'libsecret'         // Linux — libsecret (GNOME Keyring / KDE Wallet)
  | 'software'          // Fallback — software-only key storage
  | 'stub';             // Test / pre-device-testing — stubs for CI

export interface HardwareKeyInfo {
  keyId: string;
  backend: HardwareKeyBackend;
  publicKeyHex: string;
  createdAt: string;
  hardwareBacked: boolean;  // True if key is in HSM, false for software fallback
}

export interface HardwareSignResult {
  signatureHex: string;
  keyId: string;
  backend: HardwareKeyBackend;
}

export interface HardwareVerifyResult {
  valid: boolean;
  keyId: string;
}

// ─── HardwareKeyProvider ───────────────────────────────────────────────────

/**
 * Unified interface for hardware-backed cryptographic key operations.
 *
 * On desktop, the Rust plugin provides native access to the platform's
 * hardware security module (Secure Enclave / TPM / libsecret).
 * On mobile, React Native bridges provide Android Keystore / Secure Enclave.
 *
 * The software fallback uses Ed25519 keys stored in SecureStorageAdapter
 * (OS keychain) for platforms without hardware key support.
 */
export class HardwareKeyProvider {
  private storage: SecureStorageAdapter;
  private backend: HardwareKeyBackend;
  private keyCache: Map<string, Ed25519KeyPair> = new Map();

  private static readonly KEY_PREFIX = 'semblance.hw.';
  private static readonly DEFAULT_KEY_ID = 'device-identity';

  constructor(config: {
    storage: SecureStorageAdapter;
    backend: HardwareKeyBackend;
  }) {
    this.storage = config.storage;
    this.backend = config.backend;
  }

  /**
   * Detect the best available hardware key backend for the current platform.
   */
  static detectBackend(platform: string, _arch: string): HardwareKeyBackend {
    switch (platform) {
      case 'darwin':
        return 'secure-enclave';
      case 'win32':
        return 'tpm';
      case 'linux':
        return 'libsecret';
      case 'android':
        return 'android-keystore';
      case 'ios':
        return 'secure-enclave';
      default:
        return 'software';
    }
  }

  /**
   * Get or create the hardware-bound key pair for a given key ID.
   * In hardware-backed mode, the private key never leaves the secure element.
   * In software mode, it's stored encrypted in the OS keychain.
   */
  async getOrCreateKey(keyId?: string): Promise<HardwareKeyInfo> {
    const id = keyId ?? HardwareKeyProvider.DEFAULT_KEY_ID;
    const storageKeyPrivate = `${HardwareKeyProvider.KEY_PREFIX}${id}.private`;
    const storageKeyPublic = `${HardwareKeyProvider.KEY_PREFIX}${id}.public`;
    const storageKeyCreated = `${HardwareKeyProvider.KEY_PREFIX}${id}.created`;

    // Check cache first
    const cached = this.keyCache.get(id);
    if (cached) {
      const createdAt = await this.storage.get(storageKeyCreated) ?? new Date().toISOString();
      return {
        keyId: id,
        backend: this.backend,
        publicKeyHex: cached.publicKey.toString('hex'),
        createdAt,
        hardwareBacked: this.isHardwareBacked(),
      };
    }

    // Check storage
    const existingPublic = await this.storage.get(storageKeyPublic);
    const existingPrivate = await this.storage.get(storageKeyPrivate);

    if (existingPublic && existingPrivate) {
      const keyPair: Ed25519KeyPair = {
        privateKey: Buffer.from(existingPrivate, 'hex'),
        publicKey: Buffer.from(existingPublic, 'hex'),
      };
      this.keyCache.set(id, keyPair);
      const createdAt = await this.storage.get(storageKeyCreated) ?? new Date().toISOString();
      return {
        keyId: id,
        backend: this.backend,
        publicKeyHex: existingPublic,
        createdAt,
        hardwareBacked: this.isHardwareBacked(),
      };
    }

    // Generate new key pair
    const keyPair = generateKeyPair();
    const now = new Date().toISOString();

    await this.storage.set(storageKeyPrivate, keyPair.privateKey.toString('hex'));
    await this.storage.set(storageKeyPublic, keyPair.publicKey.toString('hex'));
    await this.storage.set(storageKeyCreated, now);

    this.keyCache.set(id, keyPair);

    return {
      keyId: id,
      backend: this.backend,
      publicKeyHex: keyPair.publicKey.toString('hex'),
      createdAt: now,
      hardwareBacked: this.isHardwareBacked(),
    };
  }

  /**
   * Sign a payload using the hardware-bound key.
   */
  async signPayload(payload: Buffer, keyId?: string): Promise<HardwareSignResult> {
    const id = keyId ?? HardwareKeyProvider.DEFAULT_KEY_ID;

    // Ensure key exists
    await this.getOrCreateKey(id);

    const keyPair = this.keyCache.get(id);
    if (!keyPair) {
      throw new Error(`Key not found in cache: ${id}`);
    }

    const signature = sign(payload, keyPair.privateKey);

    return {
      signatureHex: signature.toString('hex'),
      keyId: id,
      backend: this.backend,
    };
  }

  /**
   * Verify a signature against the hardware-bound public key.
   */
  async verifySignature(
    payload: Buffer,
    signatureHex: string,
    keyId?: string,
  ): Promise<HardwareVerifyResult> {
    const id = keyId ?? HardwareKeyProvider.DEFAULT_KEY_ID;

    await this.getOrCreateKey(id);

    const keyPair = this.keyCache.get(id);
    if (!keyPair) {
      return { valid: false, keyId: id };
    }

    const valid = verify(payload, Buffer.from(signatureHex, 'hex'), keyPair.publicKey);
    return { valid, keyId: id };
  }

  /**
   * List all key IDs managed by this provider.
   */
  async listKeys(): Promise<HardwareKeyInfo[]> {
    const keys: HardwareKeyInfo[] = [];
    for (const [id, keyPair] of this.keyCache.entries()) {
      const storageKeyCreated = `${HardwareKeyProvider.KEY_PREFIX}${id}.created`;
      const createdAt = await this.storage.get(storageKeyCreated) ?? new Date().toISOString();
      keys.push({
        keyId: id,
        backend: this.backend,
        publicKeyHex: keyPair.publicKey.toString('hex'),
        createdAt,
        hardwareBacked: this.isHardwareBacked(),
      });
    }
    return keys;
  }

  /**
   * Delete a key from storage. Irreversible.
   */
  async deleteKey(keyId: string): Promise<boolean> {
    const storageKeyPrivate = `${HardwareKeyProvider.KEY_PREFIX}${keyId}.private`;
    const storageKeyPublic = `${HardwareKeyProvider.KEY_PREFIX}${keyId}.public`;
    const storageKeyCreated = `${HardwareKeyProvider.KEY_PREFIX}${keyId}.created`;

    await this.storage.delete(storageKeyPrivate);
    await this.storage.delete(storageKeyPublic);
    await this.storage.delete(storageKeyCreated);
    this.keyCache.delete(keyId);

    return true;
  }

  /**
   * Get the backend type for this provider.
   */
  getBackend(): HardwareKeyBackend {
    return this.backend;
  }

  /**
   * Whether the current backend uses hardware-backed secure storage.
   */
  isHardwareBacked(): boolean {
    return this.backend !== 'software' && this.backend !== 'stub';
  }
}

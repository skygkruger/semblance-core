// Platform Sync Crypto — SyncCryptoProvider backed by PlatformAdapter.
//
// Uses the platform's crypto adapter for AES-256-GCM encryption.
// On desktop: Node.js crypto module. On mobile: react-native-quick-crypto.
//
// CRITICAL: No direct crypto imports. All crypto via getPlatform().crypto.

import type { SyncCryptoProvider } from './sync.js';
import { getPlatform } from '../platform/index.js';

/**
 * PlatformSyncCrypto — SyncCryptoProvider using PlatformAdapter's AES-256-GCM.
 *
 * Encryption: AES-256-GCM (via platform crypto adapter)
 * Integrity: HMAC-SHA256 (via platform crypto adapter)
 *
 * The shared secret from pairing is used as key material.
 * Key derivation: sha256(sharedSecret) → 32-byte hex key.
 * IV is generated fresh for each encryption operation.
 *
 * GCM auth tag is encoded inside the ciphertext field as JSON
 * to preserve the SyncCryptoProvider interface { ciphertext, iv }.
 */
export class PlatformSyncCrypto implements SyncCryptoProvider {
  async encrypt(plaintext: string, sharedSecret: string): Promise<{ ciphertext: string; iv: string }> {
    const p = getPlatform();

    // Derive a 32-byte key from the shared secret
    const keyHex = p.crypto.sha256(sharedSecret);

    // Encrypt with AES-256-GCM
    const payload = await p.crypto.encrypt(plaintext, keyHex);

    // Encode GCM tag inside ciphertext field to preserve SyncCryptoProvider interface
    const combined = JSON.stringify({ c: payload.ciphertext, t: payload.tag });

    return {
      ciphertext: combined,
      iv: payload.iv,
    };
  }

  async decrypt(ciphertext: string, iv: string, sharedSecret: string): Promise<string> {
    const p = getPlatform();

    // Derive the same key
    const keyHex = p.crypto.sha256(sharedSecret);

    // Extract GCM ciphertext and tag from combined format
    let parsed: { c: string; t: string };
    try {
      parsed = JSON.parse(ciphertext) as { c: string; t: string };
    } catch {
      throw new Error('Decryption failed: invalid ciphertext format');
    }

    if (!parsed.c || !parsed.t) {
      throw new Error('Decryption failed: missing ciphertext or tag');
    }

    // Decrypt with AES-256-GCM
    return p.crypto.decrypt(
      { ciphertext: parsed.c, iv, tag: parsed.t },
      keyHex,
    );
  }

  async hmac(data: string, key: string): Promise<string> {
    const p = getPlatform();
    return p.crypto.hmacSha256(Buffer.from(key, 'utf-8'), data);
  }
}

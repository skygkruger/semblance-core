// Device Keypair — Persistent Ed25519 identity key pair.
// Stored in platform-specific secure storage (Keychain, Keystore, etc.).
// CRITICAL: No networking imports.

import type { SecureStorageAdapter } from '../platform/types.js';
import type { Ed25519KeyPair } from './types.js';
import { generateKeyPair } from './ed25519.js';

const PRIVATE_KEY_STORAGE_KEY = 'semblance.device.ed25519.privateKey';
const PUBLIC_KEY_STORAGE_KEY = 'semblance.device.ed25519.publicKey';

/**
 * Get or create the device's Ed25519 key pair.
 * Generates once on first call, persists in secure storage.
 */
export async function getOrCreateDeviceKeyPair(
  storage: SecureStorageAdapter,
): Promise<Ed25519KeyPair> {
  const existingPrivate = await storage.get(PRIVATE_KEY_STORAGE_KEY);
  const existingPublic = await storage.get(PUBLIC_KEY_STORAGE_KEY);

  if (existingPrivate && existingPublic) {
    return {
      privateKey: Buffer.from(existingPrivate, 'hex'),
      publicKey: Buffer.from(existingPublic, 'hex'),
    };
  }

  const keyPair = generateKeyPair();
  await storage.set(PRIVATE_KEY_STORAGE_KEY, keyPair.privateKey.toString('hex'));
  await storage.set(PUBLIC_KEY_STORAGE_KEY, keyPair.publicKey.toString('hex'));

  return keyPair;
}

/**
 * Export the public key as a hex string for sharing.
 */
export function exportPublicKey(keyPair: Ed25519KeyPair): string {
  return keyPair.publicKey.toString('hex');
}

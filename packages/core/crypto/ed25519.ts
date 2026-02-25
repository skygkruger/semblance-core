// Ed25519 — Asymmetric digital signatures via @noble/curves.
// Pure JS, audited by Cure53, zero deps, no network calls.
// CRITICAL: No networking imports.

import { ed25519 } from '@noble/curves/ed25519';
import { getPlatform } from '../platform/index.js';
import type { Ed25519KeyPair } from './types.js';

/**
 * Generate a new Ed25519 key pair.
 * Uses platform randomBytes for the 32-byte seed.
 */
export function generateKeyPair(): Ed25519KeyPair {
  const seed = getPlatform().crypto.randomBytes(32);
  const publicKey = Buffer.from(ed25519.getPublicKey(seed));
  return {
    privateKey: seed,
    publicKey,
  };
}

/**
 * Sign a payload with an Ed25519 private key (seed).
 * Returns a 64-byte signature.
 */
export function sign(payload: Buffer, privateKey: Buffer): Buffer {
  const signature = ed25519.sign(payload, privateKey);
  return Buffer.from(signature);
}

/**
 * Verify an Ed25519 signature against a public key.
 * Returns true if the signature is valid.
 */
export function verify(payload: Buffer, signature: Buffer, publicKey: Buffer): boolean {
  try {
    return ed25519.verify(signature, payload, publicKey);
  } catch {
    return false;
  }
}

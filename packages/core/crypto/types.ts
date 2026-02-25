// Crypto Types — Shared type definitions for the cryptographic module.
// CRITICAL: No networking imports.

/**
 * Result of Argon2id key derivation.
 */
export interface KeyDerivationResult {
  /** 32-byte derived key as hex string (64 chars) */
  keyHex: string;
  /** 16-byte salt as hex string (32 chars) */
  saltHex: string;
  /** KDF algorithm identifier */
  algorithm: 'argon2id';
}

/**
 * Ed25519 key pair for asymmetric signing.
 */
export interface Ed25519KeyPair {
  /** 32-byte private key (seed) */
  privateKey: Buffer;
  /** 32-byte public key */
  publicKey: Buffer;
}

/**
 * Configuration for SQLCipher database encryption.
 */
export interface DatabaseEncryptionConfig {
  /** 32-byte encryption key as hex string */
  keyHex: string;
  /** SQLCipher PRAGMA cipher to use */
  cipher: 'aes-256-cbc';
}

// Crypto Module — Barrel exports for cryptographic primitives.
// CRITICAL: No networking imports.

export type { KeyDerivationResult, Ed25519KeyPair, DatabaseEncryptionConfig } from './types.js';
export { deriveKey, deriveKeyLegacy, generateSalt } from './key-derivation.js';
export { generateKeyPair, sign, verify } from './ed25519.js';
export { getOrCreateDeviceKeyPair, exportPublicKey } from './device-keypair.js';
export {
  getOrCreateDatabaseKey,
  openEncryptedDatabase,
  migrateToEncrypted,
  isDatabaseEncrypted,
} from './database-encryption.js';

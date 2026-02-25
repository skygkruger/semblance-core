// Archive Reader — Decrypts and validates Living Will archives.
// Supports both v2 (Argon2id) and v1 (SHA-256) key derivation.
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

import { getPlatform } from '../platform/index.js';
import { deriveKey, deriveKeyLegacy } from '../crypto/key-derivation.js';
import type {
  ArchiveManifest,
  LivingWillArchive,
  EncryptedArchive,
} from './types.js';

/**
 * Reads and decrypts Living Will archives.
 */
export class ArchiveReader {
  /**
   * Decrypt an encrypted archive with a passphrase.
   * Auto-detects v1 (SHA-256) vs v2 (Argon2id) from header fields.
   */
  async decryptArchive(
    encrypted: EncryptedArchive,
    passphrase: string,
  ): Promise<LivingWillArchive> {
    const p = getPlatform();

    let keyHex: string;
    if (encrypted.header.kdf === 'argon2id' && encrypted.header.salt) {
      // v2: Argon2id with stored salt
      const salt = Buffer.from(encrypted.header.salt, 'hex');
      const kdfResult = await deriveKey(passphrase, salt);
      keyHex = kdfResult.keyHex;
    } else {
      // v1: Legacy SHA-256
      keyHex = deriveKeyLegacy(passphrase);
    }

    let decrypted: string;
    try {
      decrypted = await p.crypto.decrypt(encrypted.payload, keyHex);
    } catch {
      throw new Error('Decryption failed: wrong passphrase or corrupted archive');
    }

    let archive: LivingWillArchive;
    try {
      archive = JSON.parse(decrypted) as LivingWillArchive;
    } catch {
      throw new Error('Decryption failed: invalid archive format');
    }

    return archive;
  }

  /**
   * Validate an archive manifest for version compatibility and structure.
   */
  validateManifest(manifest: ArchiveManifest): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (manifest.version === undefined || manifest.version === null) {
      return { valid: false, warnings: ['Missing version field'] };
    }

    if (typeof manifest.version !== 'number') {
      return { valid: false, warnings: ['Version field is not a number'] };
    }

    if (manifest.version > 2) {
      warnings.push(`Archive version ${manifest.version} is newer than supported (2). Some data may not import correctly.`);
    }

    if (!manifest.createdAt) {
      warnings.push('Missing createdAt field');
    }

    if (!manifest.contentSections || !Array.isArray(manifest.contentSections)) {
      warnings.push('Missing or invalid contentSections');
    }

    return { valid: true, warnings };
  }

  /**
   * Safely extract a named section from an archive.
   */
  extractSection(archive: LivingWillArchive, sectionName: string): unknown {
    return (archive as unknown as Record<string, unknown>)[sectionName] ?? null;
  }
}

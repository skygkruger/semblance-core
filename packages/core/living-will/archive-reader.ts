// Archive Reader — Decrypts and validates Living Will archives.
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

import { getPlatform } from '../platform/index.js';
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
   * Key derivation: sha256(passphrase) -> 64-char hex string.
   */
  async decryptArchive(
    encrypted: EncryptedArchive,
    passphrase: string,
  ): Promise<LivingWillArchive> {
    const p = getPlatform();
    const keyHex = p.crypto.sha256(passphrase);

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

    if (manifest.version > 1) {
      warnings.push(`Archive version ${manifest.version} is newer than supported (1). Some data may not import correctly.`);
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

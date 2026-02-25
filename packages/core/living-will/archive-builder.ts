// Archive Builder — Assembles and encrypts Living Will archives.
// v2: Argon2id key derivation (64MB, 3 iterations).
// v1 legacy: sha256(passphrase) — preserved in archive-reader for backward compat.
// CRITICAL: No networking imports. All crypto via PlatformAdapter.

import { getPlatform } from '../platform/index.js';
import { deriveKey } from '../crypto/key-derivation.js';
import type {
  ArchiveManifest,
  LivingWillArchive,
  LivingWillSectionData,
  EncryptedArchive,
} from './types.js';

const ARCHIVE_VERSION = 2;
const SEMBLANCE_MIN_VERSION = '0.30.0';

/**
 * Builds and encrypts Living Will archives.
 */
export class ArchiveBuilder {
  /**
   * Build an archive manifest from device ID and included sections.
   */
  buildManifest(deviceId: string, sections: string[]): ArchiveManifest {
    return {
      version: ARCHIVE_VERSION,
      semblanceMinVersion: SEMBLANCE_MIN_VERSION,
      createdAt: new Date().toISOString(),
      deviceId,
      contentSections: sections,
      signatureChainRef: '',
    };
  }

  /**
   * Assemble all sections into a LivingWillArchive.
   */
  buildArchive(deviceId: string, data: LivingWillSectionData): LivingWillArchive {
    const sections: string[] = [];
    if (data.knowledgeGraph !== undefined) sections.push('knowledgeGraph');
    if (data.styleProfile !== undefined) sections.push('styleProfile');
    if (data.decisionProfile !== undefined) sections.push('decisionProfile');
    if (data.relationshipMap !== undefined) sections.push('relationshipMap');
    if (data.preferences !== undefined) sections.push('preferences');
    if (data.actionSummary !== undefined) sections.push('actionSummary');
    if (data.inheritanceConfig !== undefined) sections.push('inheritanceConfig');

    const manifest = this.buildManifest(deviceId, sections);

    return {
      manifest,
      knowledgeGraph: data.knowledgeGraph,
      styleProfile: data.styleProfile,
      decisionProfile: data.decisionProfile,
      relationshipMap: data.relationshipMap,
      preferences: data.preferences,
      actionSummary: data.actionSummary,
      inheritanceConfig: data.inheritanceConfig,
    };
  }

  /**
   * Serialize an archive to a JSON string.
   */
  serializeArchive(archive: LivingWillArchive): string {
    return JSON.stringify(archive);
  }

  /**
   * Encrypt a Living Will archive with a passphrase.
   * v2: Argon2id(64MB, 3 iter) key derivation with random salt.
   */
  async createEncryptedArchive(
    archive: LivingWillArchive,
    passphrase: string,
  ): Promise<EncryptedArchive> {
    const p = getPlatform();
    const kdfResult = await deriveKey(passphrase);
    const serialized = this.serializeArchive(archive);
    const payload = await p.crypto.encrypt(serialized, kdfResult.keyHex);

    return {
      header: {
        version: ARCHIVE_VERSION,
        encrypted: true,
        createdAt: archive.manifest.createdAt,
        kdf: 'argon2id',
        salt: kdfResult.saltHex,
      },
      payload,
    };
  }
}

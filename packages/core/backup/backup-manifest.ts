// Backup Manifest — Serialization, parsing, and integrity verification.
// CRITICAL: No networking imports. Entirely local.

import type { BackupManifest, BackupContentEntry } from './types.js';

const CURRENT_MANIFEST_VERSION = 2;

export interface CreateManifestOptions {
  deviceId: string;
  semblanceVersion: string;
  salt: string;
  contents: BackupContentEntry[];
  integrityHash: string;
  signaturePublicKey: string;
}

/**
 * Create a new backup manifest with the current version.
 */
export function createManifest(opts: CreateManifestOptions): BackupManifest {
  return {
    version: CURRENT_MANIFEST_VERSION,
    createdAt: new Date().toISOString(),
    deviceId: opts.deviceId,
    semblanceVersion: opts.semblanceVersion,
    backupType: 'full',
    encryptedWith: 'argon2id',
    salt: opts.salt,
    contents: opts.contents,
    integrityHash: opts.integrityHash,
    signaturePublicKey: opts.signaturePublicKey,
  };
}

/**
 * Serialize a manifest to JSON string.
 */
export function serializeManifest(manifest: BackupManifest): string {
  return JSON.stringify(manifest);
}

/**
 * Parse a manifest from a raw JSON string.
 * Validates required fields and rejects unknown versions.
 */
export function parseManifest(raw: string): BackupManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid manifest: not valid JSON');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== 'number') {
    throw new Error('Invalid manifest: missing version');
  }

  if (obj.version > CURRENT_MANIFEST_VERSION) {
    throw new Error(
      `Unsupported manifest version ${obj.version} (max supported: ${CURRENT_MANIFEST_VERSION})`,
    );
  }

  if (typeof obj.deviceId !== 'string') {
    throw new Error('Invalid manifest: missing deviceId');
  }

  if (typeof obj.integrityHash !== 'string') {
    throw new Error('Invalid manifest: missing integrityHash');
  }

  if (typeof obj.salt !== 'string') {
    throw new Error('Invalid manifest: missing salt');
  }

  return obj as unknown as BackupManifest;
}

/**
 * Verify integrity of encrypted payload against manifest's hash.
 */
export function verifyIntegrity(manifest: BackupManifest, payloadChecksum: string): boolean {
  return manifest.integrityHash === payloadChecksum;
}

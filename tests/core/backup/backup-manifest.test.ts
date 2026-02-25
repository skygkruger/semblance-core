// Backup Manifest Tests — Serialization, parsing, and integrity verification.

import { describe, it, expect } from 'vitest';
import {
  createManifest,
  serializeManifest,
  parseManifest,
  verifyIntegrity,
} from '@semblance/core/backup/backup-manifest.js';

describe('Backup Manifest', () => {
  const baseOpts = {
    deviceId: 'device-001',
    semblanceVersion: '0.30.0',
    salt: 'a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8',
    contents: [
      { name: 'knowledge-graph', type: 'sqlite' as const, sizeBytes: 1024 },
      { name: 'audit-trail', type: 'audit-trail' as const, sizeBytes: 512 },
    ],
    integrityHash: 'abc123hash',
    signaturePublicKey: 'pubkey-hex-string',
  };

  it('createManifest builds with correct version, kdf, and fields', () => {
    const manifest = createManifest(baseOpts);

    expect(manifest.version).toBe(2);
    expect(manifest.encryptedWith).toBe('argon2id');
    expect(manifest.backupType).toBe('full');
    expect(manifest.deviceId).toBe('device-001');
    expect(manifest.semblanceVersion).toBe('0.30.0');
    expect(manifest.salt).toBe('a1b2c3d4e5f6a7b8a1b2c3d4e5f6a7b8');
    expect(manifest.contents).toHaveLength(2);
    expect(manifest.integrityHash).toBe('abc123hash');
    expect(manifest.signaturePublicKey).toBe('pubkey-hex-string');
    expect(manifest.createdAt).toBeTruthy();
  });

  it('serializeManifest + parseManifest roundtrip preserves data', () => {
    const original = createManifest(baseOpts);
    const serialized = serializeManifest(original);
    const parsed = parseManifest(serialized);

    expect(parsed.version).toBe(original.version);
    expect(parsed.deviceId).toBe(original.deviceId);
    expect(parsed.encryptedWith).toBe(original.encryptedWith);
    expect(parsed.salt).toBe(original.salt);
    expect(parsed.integrityHash).toBe(original.integrityHash);
    expect(parsed.signaturePublicKey).toBe(original.signaturePublicKey);
    expect(parsed.contents).toEqual(original.contents);
  });

  it('verifyIntegrity returns true when checksums match', () => {
    const manifest = createManifest(baseOpts);
    expect(verifyIntegrity(manifest, 'abc123hash')).toBe(true);
  });

  it('verifyIntegrity returns false when checksums mismatch', () => {
    const manifest = createManifest(baseOpts);
    expect(verifyIntegrity(manifest, 'wrong-hash')).toBe(false);
  });

  it('parseManifest rejects manifest with unknown version (>2)', () => {
    const futureManifest = JSON.stringify({
      version: 99,
      deviceId: 'device-001',
      salt: 'abc',
      integrityHash: 'def',
    });

    expect(() => parseManifest(futureManifest)).toThrow(
      'Unsupported manifest version 99',
    );
  });
});

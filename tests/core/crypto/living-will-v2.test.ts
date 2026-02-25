// Living Will v2 Tests — Argon2id encryption, v1 backward compat, header fields.

import { describe, it, expect, beforeAll } from 'vitest';
import { ArchiveBuilder } from '@semblance/core/living-will/archive-builder.js';
import { ArchiveReader } from '@semblance/core/living-will/archive-reader.js';
import { setPlatform, getPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import type { EncryptedArchive } from '@semblance/core/living-will/types.js';

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

describe('Living Will Archive v2 — Argon2id', () => {
  const passphrase = 'test-archive-passphrase';
  const builder = new ArchiveBuilder();
  const reader = new ArchiveReader();

  it('v2 archive header includes kdf and salt fields', async () => {
    const archive = builder.buildArchive('dev-001', { preferences: { theme: 'dark' } });
    const encrypted = await builder.createEncryptedArchive(archive, passphrase);
    expect(encrypted.header.version).toBe(2);
    expect(encrypted.header.kdf).toBe('argon2id');
    expect(encrypted.header.salt).toBeDefined();
    expect(encrypted.header.salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('v2 encrypt+decrypt roundtrip succeeds', async () => {
    const archive = builder.buildArchive('dev-001', {
      knowledgeGraph: { entities: ['Alice', 'Bob'] },
      styleProfile: { tone: 'formal' },
    });
    const encrypted = await builder.createEncryptedArchive(archive, passphrase);
    const decrypted = await reader.decryptArchive(encrypted, passphrase);
    expect(decrypted.manifest.version).toBe(2);
    expect(decrypted.knowledgeGraph).toEqual({ entities: ['Alice', 'Bob'] });
    expect(decrypted.styleProfile).toEqual({ tone: 'formal' });
  });

  it('v2 archive decryption fails with wrong passphrase', async () => {
    const archive = builder.buildArchive('dev-001', { preferences: { lang: 'en' } });
    const encrypted = await builder.createEncryptedArchive(archive, passphrase);
    await expect(reader.decryptArchive(encrypted, 'wrong-passphrase'))
      .rejects.toThrow('Decryption failed');
  });

  it('v2 manifest validation accepts version 2', () => {
    const manifest = builder.buildManifest('dev-001', ['preferences']);
    const result = reader.validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('Living Will Archive v1 — Backward Compatibility', () => {
  const reader = new ArchiveReader();

  it('decrypts v1 archive (no kdf field) using legacy SHA-256', async () => {
    const p = getPlatform();
    const passphrase = 'legacy-v1-pass';
    // Simulate v1 encryption: sha256(passphrase) as key
    const keyHex = p.crypto.sha256(passphrase);
    const archive = {
      manifest: {
        version: 1,
        semblanceMinVersion: '0.26.0',
        createdAt: new Date().toISOString(),
        deviceId: 'dev-legacy',
        contentSections: ['preferences'],
        signatureChainRef: '',
      },
      preferences: { theme: 'light' },
    };
    const payload = await p.crypto.encrypt(JSON.stringify(archive), keyHex);
    const v1Encrypted: EncryptedArchive = {
      header: {
        version: 1,
        encrypted: true,
        createdAt: archive.manifest.createdAt,
      },
      payload,
    };
    const decrypted = await reader.decryptArchive(v1Encrypted, passphrase);
    expect(decrypted.manifest.version).toBe(1);
    expect(decrypted.preferences).toEqual({ theme: 'light' });
  });

  it('validates v1 manifest with version warning when higher than supported', () => {
    const result = reader.validateManifest({
      version: 99,
      semblanceMinVersion: '9.0.0',
      createdAt: new Date().toISOString(),
      deviceId: 'future',
      contentSections: ['data'],
      signatureChainRef: '',
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w: string) => w.includes('newer than supported'))).toBe(true);
  });

  it('v2 and v1 archives produce different ciphertext for same passphrase', async () => {
    const p = getPlatform();
    const passphrase = 'same-pass';
    const builder = new ArchiveBuilder();
    const archive = builder.buildArchive('dev-001', { preferences: { x: 1 } });

    // v2 with Argon2id
    const v2 = await builder.createEncryptedArchive(archive, passphrase);

    // v1 with SHA-256
    const keyHex = p.crypto.sha256(passphrase);
    const v1Payload = await p.crypto.encrypt(JSON.stringify(archive), keyHex);

    // Different encryption keys → different ciphertext
    expect(v2.payload.ciphertext).not.toBe(v1Payload.ciphertext);
  });

  it('v1 archive with explicit sha256 kdf field still works', async () => {
    const p = getPlatform();
    const passphrase = 'explicit-sha256';
    const keyHex = p.crypto.sha256(passphrase);
    const archiveData = {
      manifest: {
        version: 1,
        semblanceMinVersion: '0.26.0',
        createdAt: new Date().toISOString(),
        deviceId: 'dev-explicit',
        contentSections: ['preferences'],
        signatureChainRef: '',
      },
      preferences: { mode: 'test' },
    };
    const payload = await p.crypto.encrypt(JSON.stringify(archiveData), keyHex);
    const encrypted: EncryptedArchive = {
      header: {
        version: 1,
        encrypted: true,
        createdAt: archiveData.manifest.createdAt,
        kdf: 'sha256',
      },
      payload,
    };
    const decrypted = await reader.decryptArchive(encrypted, passphrase);
    expect(decrypted.preferences).toEqual({ mode: 'test' });
  });
});

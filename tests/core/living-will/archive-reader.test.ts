/**
 * Step 26 — ArchiveReader tests (Commit 2).
 * Tests decryption, wrong-passphrase handling, and manifest validation.
 */

import { describe, it, expect } from 'vitest';
import { ArchiveBuilder } from '@semblance/core/living-will/archive-builder';
import { ArchiveReader } from '@semblance/core/living-will/archive-reader';
import type { ArchiveManifest } from '@semblance/core/living-will/types';

function createPair() {
  return { builder: new ArchiveBuilder(), reader: new ArchiveReader() };
}

describe('ArchiveReader (Step 26)', () => {
  it('decrypts archive with correct passphrase and returns valid archive', async () => {
    const { builder, reader } = createPair();
    const archive = builder.buildArchive('dev-01', {
      knowledgeGraph: { entities: ['Alice'] },
      styleProfile: { tone: 'formal' },
    });

    const encrypted = await builder.createEncryptedArchive(archive, 'correct-pass');
    const decrypted = await reader.decryptArchive(encrypted, 'correct-pass');

    expect(decrypted.manifest.version).toBe(2);
    expect(decrypted.knowledgeGraph).toEqual({ entities: ['Alice'] });
    expect(decrypted.styleProfile).toEqual({ tone: 'formal' });
  });

  it('decrypting with wrong passphrase throws error', async () => {
    const { builder, reader } = createPair();
    const archive = builder.buildArchive('dev-01', { knowledgeGraph: { data: true } });
    const encrypted = await builder.createEncryptedArchive(archive, 'right-pass');

    await expect(reader.decryptArchive(encrypted, 'wrong-pass'))
      .rejects.toThrow(/[Dd]ecryption failed/);
  });

  it('validates manifest — missing version field returns { valid: false }', () => {
    const reader = new ArchiveReader();

    const badManifest = {
      semblanceMinVersion: '0.26.0',
      createdAt: new Date().toISOString(),
      deviceId: 'dev-01',
      contentSections: [],
      signatureChainRef: '',
    } as unknown as ArchiveManifest;
    // Remove version to simulate missing field
    delete (badManifest as unknown as Record<string, unknown>).version;

    const result = reader.validateManifest(badManifest);
    expect(result.valid).toBe(false);
  });
});

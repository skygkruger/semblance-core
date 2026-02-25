/**
 * Step 26 — ArchiveBuilder tests (Commit 2).
 * Tests manifest building, archive assembly, serialization, and encryption.
 */

import { describe, it, expect } from 'vitest';
import { ArchiveBuilder } from '@semblance/core/living-will/archive-builder';
import type { LivingWillSectionData } from '@semblance/core/living-will/types';

function createBuilder(): ArchiveBuilder {
  return new ArchiveBuilder();
}

function makeSectionData(): LivingWillSectionData {
  return {
    knowledgeGraph: { entities: [{ id: 'e1', name: 'Alice' }], relations: [] },
    styleProfile: { tone: { formalityScore: 0.6 } },
    decisionProfile: { patterns: ['approve-emails'] },
    relationshipMap: { contacts: [{ name: 'Bob', freq: 5 }] },
    preferences: { autonomy: { email: 'partner' } },
    actionSummary: { totalActions: 42, timeSaved: 3600 },
  };
}

describe('ArchiveBuilder (Step 26)', () => {
  it('builds manifest with correct version (2) and semblanceMinVersion', () => {
    const builder = createBuilder();
    const manifest = builder.buildManifest('device-001', ['knowledgeGraph', 'styleProfile']);

    expect(manifest.version).toBe(2);
    expect(manifest.semblanceMinVersion).toBe('0.30.0');
    expect(manifest.deviceId).toBe('device-001');
    expect(manifest.contentSections).toEqual(['knowledgeGraph', 'styleProfile']);
    expect(manifest.createdAt).toBeTruthy();
  });

  it('builds archive with all sections from input data', () => {
    const builder = createBuilder();
    const data = makeSectionData();
    const archive = builder.buildArchive('dev-01', data);

    expect(archive.manifest.contentSections).toHaveLength(6);
    expect(archive.knowledgeGraph).toEqual(data.knowledgeGraph);
    expect(archive.styleProfile).toEqual(data.styleProfile);
    expect(archive.decisionProfile).toEqual(data.decisionProfile);
    expect(archive.relationshipMap).toEqual(data.relationshipMap);
    expect(archive.preferences).toEqual(data.preferences);
    expect(archive.actionSummary).toEqual(data.actionSummary);
  });

  it('serializes and deserializes archive without data loss', () => {
    const builder = createBuilder();
    const data = makeSectionData();
    const archive = builder.buildArchive('dev-01', data);

    const serialized = builder.serializeArchive(archive);
    const deserialized = JSON.parse(serialized);

    expect(deserialized.manifest.version).toBe(2);
    expect(deserialized.knowledgeGraph).toEqual(data.knowledgeGraph);
    expect(deserialized.actionSummary.totalActions).toBe(42);
  });

  it('encrypts archive — ciphertext is different from plaintext', async () => {
    const builder = createBuilder();
    const data = makeSectionData();
    const archive = builder.buildArchive('dev-01', data);
    const serialized = builder.serializeArchive(archive);

    const encrypted = await builder.createEncryptedArchive(archive, 'my-passphrase');

    expect(encrypted.payload.ciphertext).not.toBe(serialized);
    expect(encrypted.payload.iv).toBeTruthy();
    expect(encrypted.payload.tag).toBeTruthy();
  });

  it('encrypted archive has correct header { version: 2, encrypted: true, kdf: argon2id }', async () => {
    const builder = createBuilder();
    const archive = builder.buildArchive('dev-01', { knowledgeGraph: { test: true } });

    const encrypted = await builder.createEncryptedArchive(archive, 'pass');

    expect(encrypted.header.version).toBe(2);
    expect(encrypted.header.kdf).toBe('argon2id');
    expect(encrypted.header.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(encrypted.header.encrypted).toBe(true);
    expect(encrypted.header.createdAt).toBeTruthy();
  });
});

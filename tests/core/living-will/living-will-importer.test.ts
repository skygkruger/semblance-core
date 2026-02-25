/**
 * Step 26 — LivingWillImporter tests (Commit 4).
 * Tests premium gating, import, wrong passphrase, signature verification, partial archives.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { LivingWillExporter } from '@semblance/core/living-will/living-will-exporter';
import { LivingWillImporter } from '@semblance/core/living-will/living-will-importer';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { AttestationVerifier } from '@semblance/core/attestation/attestation-verifier';
import { getPlatform } from '@semblance/core/platform/index';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;
const fileStore: Record<string, string> = {};
const SIGNING_KEY = Buffer.from('test-living-will-signing-key-32bytes!!!!');

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  const p = getPlatform();
  vi.spyOn(p.fs, 'writeFileSync').mockImplementation((path: string, data: string | Buffer) => {
    fileStore[path] = typeof data === 'string' ? data : data.toString();
  });
  vi.spyOn(p.fs, 'readFileSync').mockImplementation((path: string) => {
    if (!fileStore[path]) throw new Error('File not found');
    return fileStore[path]!;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  for (const key of Object.keys(fileStore)) delete fileStore[key];
});

async function exportArchive(passphrase: string, path: string) {
  activatePremium();
  const signer = new AttestationSigner({
    signingKey: SIGNING_KEY,
    deviceIdentity: { id: 'export-device', platform: 'desktop' },
  });
  const exporter = new LivingWillExporter({
    db: db as unknown as DatabaseHandle,
    premiumGate: gate,
    deviceId: 'export-device',
    documentStore: {
      listDocuments: () => [{ id: 'd1', title: 'Test Doc', source: 'file', contentHash: 'abc', mimeType: 'text/plain' }],
      getStats: () => ({ totalDocuments: 1 }),
    },
    styleProfileStore: { getActiveProfile: () => ({ tone: { formalityScore: 0.5 } }) },
    autonomyManager: { getConfig: () => ({ email: 'partner' }) },
    attestationSigner: signer,
  });
  exporter.initSchema();
  return exporter.export({}, passphrase, path);
}

describe('LivingWillImporter (Step 26)', () => {
  it('rejects import when premium gate is inactive', async () => {
    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'local-dev',
    });

    const result = await importer.import('/tmp/archive.semblance', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Digital Representative');
  });

  it('imports archive and restores all sections', async () => {
    await exportArchive('my-pass', '/tmp/test.semblance');

    const insertedDocs: unknown[] = [];
    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'export-device',
      documentStore: { insertDocument: (p: Record<string, unknown>) => { insertedDocs.push(p); } },
      styleProfileStore: { createProfile: vi.fn() },
      autonomyManager: { setDomainTier: vi.fn() },
    });

    const result = await importer.import('/tmp/test.semblance', 'my-pass');

    expect(result.success).toBe(true);
    expect(result.sectionsRestored).toContain('knowledgeGraph');
    expect(result.sectionsRestored).toContain('styleProfile');
    expect(result.sectionsRestored).toContain('preferences');
  });

  it('wrong passphrase returns error', async () => {
    await exportArchive('right-pass', '/tmp/wrong.semblance');

    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'local-dev',
    });

    const result = await importer.import('/tmp/wrong.semblance', 'wrong-pass');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/[Dd]ecryption failed/);
  });

  it('verifies signature — warns on device mismatch but succeeds', async () => {
    await exportArchive('pass', '/tmp/signed.semblance');

    const verifier = new AttestationVerifier();
    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'different-device',
      attestationVerifier: verifier,
    });

    const result = await importer.import('/tmp/signed.semblance', 'pass', SIGNING_KEY);

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes('different device'))).toBe(true);
  });

  it('reports warnings for version mismatch (newer archive version)', async () => {
    // Export and then tamper with the archive to set a higher version
    await exportArchive('pass', '/tmp/ver.semblance');

    // Manually decrypt, modify, re-encrypt to simulate a future version (3)
    const { ArchiveReader } = await import('@semblance/core/living-will/archive-reader');
    const { ArchiveBuilder } = await import('@semblance/core/living-will/archive-builder');
    const reader = new ArchiveReader();
    const builder = new ArchiveBuilder();

    const encrypted = JSON.parse(fileStore['/tmp/ver.semblance']!);
    const archive = await reader.decryptArchive(encrypted, 'pass');
    archive.manifest.version = 3;
    const reEncrypted = await builder.createEncryptedArchive(archive, 'pass');
    fileStore['/tmp/ver.semblance'] = JSON.stringify(reEncrypted);

    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'export-device',
    });

    const result = await importer.import('/tmp/ver.semblance', 'pass');

    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes('newer'))).toBe(true);
  });

  it('handles missing optional sections gracefully (partial archive)', async () => {
    // Export with only knowledge graph (no style, no contacts, etc.)
    activatePremium();
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      documentStore: {
        listDocuments: () => [{ id: 'd1', title: 'Only Doc' }],
        getStats: () => ({ totalDocuments: 1 }),
      },
    });
    exporter.initSchema();
    await exporter.export({}, 'pass', '/tmp/partial.semblance');

    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'dev-01',
      documentStore: { insertDocument: vi.fn() },
    });

    const result = await importer.import('/tmp/partial.semblance', 'pass');

    expect(result.success).toBe(true);
    expect(result.sectionsRestored).toContain('knowledgeGraph');
    expect(result.sectionsRestored).not.toContain('styleProfile');
    expect(result.sectionsRestored).not.toContain('relationshipMap');
  });
});

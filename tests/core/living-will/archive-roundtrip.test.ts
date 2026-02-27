/**
 * Step 26 — Archive roundtrip tests (Commit 4).
 * Tests full export -> import cycle.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { LivingWillExporter } from '@semblance/core/living-will/living-will-exporter';
import { LivingWillImporter } from '@semblance/core/living-will/living-will-importer';
import { getPlatform } from '@semblance/core/platform/index';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;
const fileStore: Record<string, string> = {};

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
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

describe('Archive Roundtrip (Step 26)', () => {
  it('full roundtrip: export -> import on fresh DB -> verify sections match', async () => {
    activatePremium();
    const testDocs = [{ id: 'd1', title: 'Notes', source: 'file', contentHash: 'h1', mimeType: 'text/plain' }];
    const testStyle = { tone: { formalityScore: 0.7 } };
    const testContacts = [{ name: 'Alice' }, { name: 'Bob' }];

    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      documentStore: {
        listDocuments: () => testDocs,
        getStats: () => ({ totalDocuments: 1 }),
      },
      styleProfileStore: { getActiveProfile: () => testStyle },
      contactStore: { getAllContacts: () => testContacts },
      autonomyManager: { getConfig: () => ({ email: 'alter_ego' }) },
    });
    exporter.initSchema();

    const exportResult = await exporter.export({}, 'roundtrip-pass', '/tmp/rt.semblance');
    expect(exportResult.success).toBe(true);

    // Import into fresh stores
    const importedDocs: unknown[] = [];
    const importedContacts: unknown[] = [];
    let importedStyle: unknown = null;
    const domainTiers: Record<string, string> = {};

    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'dev-01',
      documentStore: { insertDocument: (p: Record<string, unknown>) => { importedDocs.push(p); } },
      styleProfileStore: { createProfile: (p: unknown) => { importedStyle = p; } },
      contactStore: { insertContact: (c: unknown) => { importedContacts.push(c); } },
      autonomyManager: { setDomainTier: (d: string, t: string) => { domainTiers[d] = t; } },
    });

    const importResult = await importer.import('/tmp/rt.semblance', 'roundtrip-pass');
    expect(importResult.success).toBe(true);
    expect(importResult.sectionsRestored).toContain('knowledgeGraph');
    expect(importResult.sectionsRestored).toContain('styleProfile');
    expect(importResult.sectionsRestored).toContain('relationshipMap');
    expect(importResult.sectionsRestored).toContain('preferences');

    expect(importedDocs).toHaveLength(1);
    expect((importedDocs[0] as Record<string, unknown>).title).toBe('Notes');
    expect(importedStyle).toEqual(testStyle);
    expect(importedContacts).toHaveLength(2);
    expect(domainTiers.email).toBe('alter_ego');
  });

  it('roundtrip with selective export preserves included sections', async () => {
    activatePremium();
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      documentStore: {
        listDocuments: () => [{ id: 'd1', title: 'Doc' }],
        getStats: () => ({ totalDocuments: 1 }),
      },
      styleProfileStore: { getActiveProfile: () => ({ tone: { score: 0.3 } }) },
      contactStore: { getAllContacts: () => [{ name: 'Charlie' }] },
    });
    exporter.initSchema();

    // Export with styleProfile excluded
    await exporter.export(
      { includeStyleProfile: false },
      'sel-pass',
      '/tmp/sel.semblance',
    );

    let createdProfile = false;
    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'dev-01',
      documentStore: { insertDocument: vi.fn() },
      styleProfileStore: { createProfile: () => { createdProfile = true; } },
      contactStore: { insertContact: vi.fn() },
    });

    const result = await importer.import('/tmp/sel.semblance', 'sel-pass');

    expect(result.success).toBe(true);
    expect(result.sectionsRestored).toContain('knowledgeGraph');
    expect(result.sectionsRestored).not.toContain('styleProfile');
    expect(createdProfile).toBe(false);
  });
});

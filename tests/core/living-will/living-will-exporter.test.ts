/**
 * Step 26 — LivingWillExporter tests (Commit 3).
 * Tests premium gating, full export, section counts, history recording, encryption.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { LivingWillExporter } from '@semblance/core/living-will/living-will-exporter';
import { getPlatform } from '@semblance/core/platform/index';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

function makeMockStores() {
  return {
    documentStore: {
      listDocuments: () => [{ id: 'doc1', title: 'Notes' }, { id: 'doc2', title: 'Emails' }],
      getStats: () => ({ totalDocuments: 2 }),
    },
    styleProfileStore: {
      getActiveProfile: () => ({ tone: { formalityScore: 0.5 } }),
    },
    approvalPatternTracker: {
      getAllPatterns: () => [{ actionType: 'email.send', consecutiveApprovals: 5 }],
    },
    contactStore: {
      getAllContacts: () => [{ name: 'Alice' }, { name: 'Bob' }],
    },
    autonomyManager: {
      getConfig: () => ({ email: 'partner', calendar: 'guardian' }),
    },
  };
}

// Track written files in memory
const writtenFiles: Record<string, string> = {};

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  // Spy on platform fs.writeFileSync
  const p = getPlatform();
  vi.spyOn(p.fs, 'writeFileSync').mockImplementation((path: string, data: string | Buffer) => {
    writtenFiles[path] = typeof data === 'string' ? data : data.toString();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  for (const key of Object.keys(writtenFiles)) delete writtenFiles[key];
});

describe('LivingWillExporter (Step 26)', () => {
  it('rejects export when premium gate is inactive', async () => {
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
    });
    exporter.initSchema();

    const result = await exporter.export({}, 'pass', '/tmp/archive.semblance');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Digital Representative');
  });

  it('exports archive with all sections included (default config)', async () => {
    activatePremium();
    const stores = makeMockStores();
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      ...stores,
    });
    exporter.initSchema();

    const result = await exporter.export({}, 'my-password', '/tmp/archive.semblance');

    expect(result.success).toBe(true);
    expect(result.archivePath).toBe('/tmp/archive.semblance');
    expect(Object.keys(result.sectionCounts).length).toBeGreaterThanOrEqual(4);
  });

  it('export result contains correct section counts', async () => {
    activatePremium();
    const stores = makeMockStores();
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      ...stores,
    });
    exporter.initSchema();

    const result = await exporter.export({}, 'pass', '/tmp/out.semblance');

    expect(result.sectionCounts.knowledgeGraph).toBe(2); // 2 documents
    expect(result.sectionCounts.styleProfile).toBe(1);
    expect(result.sectionCounts.relationshipMap).toBe(2); // 2 contacts
  });

  it('records export in living_will_exports history table', async () => {
    activatePremium();
    const stores = makeMockStores();
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      ...stores,
    });
    exporter.initSchema();

    await exporter.export({}, 'pass', '/tmp/history.semblance');

    const history = exporter.getExportHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.archivePath).toBe('/tmp/history.semblance');
    expect(history[0]!.deviceId).toBe('dev-01');
  });

  it('encrypted archive is not readable as plain JSON archive', async () => {
    activatePremium();
    const stores = makeMockStores();
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: 'dev-01',
      ...stores,
    });
    exporter.initSchema();

    await exporter.export({}, 'pass', '/tmp/enc.semblance');

    const written = writtenFiles['/tmp/enc.semblance'];
    expect(written).toBeTruthy();
    const parsed = JSON.parse(written!);
    // It should be an encrypted archive, not a raw archive
    expect(parsed.header).toBeDefined();
    expect(parsed.header.encrypted).toBe(true);
    expect(parsed.payload).toBeDefined();
    // The payload should not contain readable manifest
    expect(parsed.manifest).toBeUndefined();
  });
});

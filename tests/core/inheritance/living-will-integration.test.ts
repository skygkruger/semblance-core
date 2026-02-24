/**
 * Step 27 — Living Will Integration tests (Commit 7).
 * Tests export strips secrets, export includes summaries, builder includes section,
 * import warns about device-bound packages, Knowledge Moment fires on 3+ sections.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { InheritanceConfigStore } from '@semblance/core/inheritance/inheritance-config-store';
import { InheritanceLivingWillIntegration } from '@semblance/core/inheritance/living-will-integration';
import { ArchiveBuilder } from '@semblance/core/living-will/archive-builder';
import { LivingWillImporter } from '@semblance/core/living-will/living-will-importer';
import type { InheritanceExportData } from '@semblance/core/inheritance/types';
import { nanoid } from 'nanoid';

let db: InstanceType<typeof Database>;
let store: InheritanceConfigStore;
let integration: InheritanceLivingWillIntegration;

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

function seedPartyWithActions(): void {
  const now = new Date().toISOString();
  const actionId = `ia_${nanoid()}`;
  store.insertParty({
    id: 'tp-1', name: 'Alice Smith', email: 'alice@example.com',
    relationship: 'spouse', passphraseHash: 'secret_hash_abc123',
    createdAt: now, updatedAt: now,
  });
  store.insertAction({
    id: actionId, partyId: 'tp-1', category: 'notification',
    sequenceOrder: 1, actionType: 'email.send', payload: { to: ['bob@example.com'] },
    label: 'Notify Bob', requiresDeletionConsensus: false,
    createdAt: now, updatedAt: now,
  });
  store.insertTemplate({
    id: `nt_${nanoid()}`, partyId: 'tp-1', actionId,
    recipientName: 'Bob', recipientEmail: 'bob@example.com',
    subject: 'Message', body: 'Content', lastReviewedAt: now,
    createdAt: now, updatedAt: now,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new InheritanceConfigStore(db as unknown as DatabaseHandle);
  store.initSchema();
  integration = new InheritanceLivingWillIntegration(store);
});

afterEach(() => {
  db.close();
});

describe('InheritanceLivingWillIntegration (Step 27)', () => {
  it('strips passphrase hashes from export data', () => {
    seedPartyWithActions();
    const exportData = integration.collectForExport();

    expect(exportData).not.toBeNull();
    // Party summaries should NOT contain passphraseHash
    for (const party of exportData!.parties) {
      expect(party).not.toHaveProperty('passphraseHash');
      expect(party).not.toHaveProperty('id');
    }
    // Serialized data should not contain the hash value
    const serialized = JSON.stringify(exportData);
    expect(serialized).not.toContain('secret_hash_abc123');
  });

  it('export includes party summaries and counts', () => {
    seedPartyWithActions();
    const exportData = integration.collectForExport();

    expect(exportData!.parties).toHaveLength(1);
    expect(exportData!.parties[0]!.name).toBe('Alice Smith');
    expect(exportData!.parties[0]!.email).toBe('alice@example.com');
    expect(exportData!.parties[0]!.relationship).toBe('spouse');
    expect(exportData!.parties[0]!.actionCount).toBe(1);
    expect(exportData!.actionCount).toBe(1);
    expect(exportData!.templateCount).toBe(1);
  });

  it('ArchiveBuilder includes inheritanceConfig section', () => {
    const builder = new ArchiveBuilder();
    const archive = builder.buildArchive('dev-01', {
      styleProfile: { version: 1 },
      inheritanceConfig: { config: { timeLockHours: 48 } },
    });

    expect(archive.manifest.contentSections).toContain('inheritanceConfig');
    expect(archive.inheritanceConfig).toBeTruthy();
  });

  it('import warns about device-bound packages', () => {
    const importData: InheritanceExportData = {
      config: { timeLockHours: 48, requireStepConfirmation: true, requireAllPartiesForDeletion: true, lastReviewedAt: null },
      parties: [{ name: 'Alice', email: 'alice@x.com', relationship: 'spouse', actionCount: 1 }],
      actionCount: 1,
      templateCount: 1,
      lastReviewedAt: null,
    };

    const result = integration.importInheritanceConfig(importData);
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('device-bound');

    // Config should be updated
    const config = store.getConfig();
    expect(config.timeLockHours).toBe(48);
  });

  it('Knowledge Moment fires when 3+ sections restored on import', async () => {
    const gate = new PremiumGate(db as unknown as DatabaseHandle);
    activatePremium();
    const triggerFn = vi.fn();

    const importer = new LivingWillImporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      localDeviceId: 'dev-01',
      knowledgeMomentTrigger: { triggerIfReady: triggerFn },
    });

    // Build a minimal archive with 3+ sections
    const builder = new ArchiveBuilder();
    const archive = builder.buildArchive('dev-01', {
      knowledgeGraph: { documents: [] },
      styleProfile: { version: 1 },
      preferences: { autonomy: {} },
    });

    // Write to mock file
    const { getPlatform } = await import('@semblance/core/platform/index');
    const p = getPlatform();

    const encrypted = await builder.createEncryptedArchive(archive, 'test-pass');
    const archivePath = p.path.join(p.hardware.homedir(), 'test-archive.semblance');
    p.fs.writeFileSync(archivePath, JSON.stringify(encrypted));

    const result = await importer.import(archivePath, 'test-pass');
    expect(result.success).toBe(true);
    expect(result.sectionsRestored.length).toBeGreaterThanOrEqual(3);
    expect(triggerFn).toHaveBeenCalledWith(result.sectionsRestored.length);

    // Cleanup
    try { p.fs.unlinkSync(archivePath); } catch { /* ignore */ }
  });
});

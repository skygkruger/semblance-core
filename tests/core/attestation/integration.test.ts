/**
 * Step 26 — Integration tests (Commit 8).
 * Tests cross-feature flows, trackers, and premium gate for new features.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { LivingWillExporter } from '@semblance/core/living-will/living-will-exporter';
import { WitnessGenerator } from '@semblance/core/witness/witness-generator';
import { LivingWillTracker } from '@semblance/core/living-will/living-will-tracker';
import { WitnessTracker } from '@semblance/core/witness/witness-tracker';
import type { DeviceIdentity } from '@semblance/core/attestation/types';
import { getPlatform } from '@semblance/core/platform/index';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const KEY = Buffer.from('integration-test-signing-key-32-bytes!');
const DEVICE: DeviceIdentity = { id: 'int-dev', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

const fileStore: Record<string, string> = {};

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
  const p = getPlatform();
  vi.spyOn(p.fs, 'writeFileSync').mockImplementation((path: string, data: string | Buffer) => {
    fileStore[path] = typeof data === 'string' ? data : data.toString();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  for (const key of Object.keys(fileStore)) delete fileStore[key];
});

describe('Step 26 Integration (Commit 8)', () => {
  it('Living Will export followed by Witness attestation generation (cross-feature)', async () => {
    activatePremium();
    const signer = new AttestationSigner({ signingKey: KEY, deviceIdentity: DEVICE });

    // Export a Living Will
    const exporter = new LivingWillExporter({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      deviceId: DEVICE.id,
      documentStore: {
        listDocuments: () => [{ id: 'd1', title: 'Test' }],
        getStats: () => ({ totalDocuments: 1 }),
      },
      attestationSigner: signer,
    });
    exporter.initSchema();
    const exportResult = await exporter.export({}, 'pass', '/tmp/int.semblance');
    expect(exportResult.success).toBe(true);

    // Generate a witness attestation for the export action
    const gen = new WitnessGenerator({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      attestationSigner: signer,
      deviceIdentity: DEVICE,
    });
    gen.initSchema();
    const witnessResult = gen.generate('export-action-01', 'Exported Living Will archive');

    expect(witnessResult.success).toBe(true);
    expect(witnessResult.attestation!.action).toBe('Exported Living Will archive');
  });

  it('LivingWillTracker returns insight when export is stale', () => {
    activatePremium();
    // Create the exports table and insert an old export
    db.exec(`
      CREATE TABLE IF NOT EXISTS living_will_exports (
        id TEXT PRIMARY KEY,
        exported_at TEXT NOT NULL,
        archive_path TEXT NOT NULL,
        sections TEXT NOT NULL,
        device_id TEXT NOT NULL
      )
    `);
    const oldDate = new Date(Date.now() - 40 * 86_400_000).toISOString();
    db.prepare('INSERT INTO living_will_exports VALUES (?, ?, ?, ?, ?)').run(
      'old-export', oldDate, '/tmp/old.semblance', '["knowledgeGraph"]', 'dev-01',
    );

    const tracker = new LivingWillTracker({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      cadenceMs: 30 * 86_400_000, // 30 days
    });

    const insights = tracker.generateInsights();
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]!.type).toBe('living-will-stale');
  });

  it('LivingWillTracker returns empty when premium inactive', () => {
    // No premium activation
    const tracker = new LivingWillTracker({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      cadenceMs: 30 * 86_400_000,
    });

    expect(tracker.generateInsights()).toHaveLength(0);
  });

  it('WitnessTracker returns insight for unattested high-value actions', () => {
    activatePremium();
    // Create audit_trail and witness_attestations tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        timestamp TEXT,
        action TEXT,
        direction TEXT,
        status TEXT,
        payload_hash TEXT,
        signature TEXT,
        chain_hash TEXT,
        estimated_time_saved_seconds INTEGER DEFAULT 0
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS witness_attestations (
        id TEXT PRIMARY KEY,
        audit_entry_id TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        autonomy_tier TEXT NOT NULL,
        device_id TEXT NOT NULL,
        attestation_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Insert high-value unattested actions
    db.prepare('INSERT INTO audit_trail (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'at-1', 'r1', new Date().toISOString(), 'email.send', 'request', 'success', 'h1', 's1', 'c1',
    );
    db.prepare('INSERT INTO audit_trail (id, request_id, timestamp, action, direction, status, payload_hash, signature, chain_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'at-2', 'r2', new Date().toISOString(), 'calendar.create', 'request', 'success', 'h2', 's2', 'c2',
    );

    const tracker = new WitnessTracker({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
    });

    const insights = tracker.generateInsights();
    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]!.type).toBe('witness-unattested');
    expect(insights[0]!.summary).toContain('2');
  });

  it('WitnessTracker returns empty when premium inactive', () => {
    const tracker = new WitnessTracker({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
    });

    expect(tracker.generateInsights()).toHaveLength(0);
  });

  it('premium gate blocks both features for free tier, allows for DR tier', () => {
    // Free tier
    expect(gate.isFeatureAvailable('living-will')).toBe(false);
    expect(gate.isFeatureAvailable('witness-attestation')).toBe(false);

    // Activate premium
    activatePremium();
    expect(gate.isFeatureAvailable('living-will')).toBe(true);
    expect(gate.isFeatureAvailable('witness-attestation')).toBe(true);
  });
});

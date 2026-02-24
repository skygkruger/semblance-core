/**
 * Step 26 — WitnessExporter tests (Commit 7).
 * Tests attestation JSON export and public key export format.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { WitnessGenerator } from '@semblance/core/witness/witness-generator';
import { WitnessExporter } from '@semblance/core/witness/witness-exporter';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const KEY = Buffer.from('exporter-test-key-for-witness-32-bytes!');
const DEVICE: DeviceIdentity = { id: 'export-dev', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('WitnessExporter (Step 26)', () => {
  it('exports attestation as valid JSON string', () => {
    activatePremium();
    const signer = new AttestationSigner({ signingKey: KEY, deviceIdentity: DEVICE });
    const gen = new WitnessGenerator({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      attestationSigner: signer,
      deviceIdentity: DEVICE,
    });
    gen.initSchema();
    const result = gen.generate('a1', 'Test action');

    const exporter = new WitnessExporter();
    const json = exporter.exportAsJson(result.attestation!);

    const parsed = JSON.parse(json);
    expect(parsed['@context']).toBe('https://veridian.run/witness/v1');
    expect(parsed.action).toBe('Test action');
    expect(parsed.proof).toBeDefined();
  });

  it('exports public key with correct format (algorithm, key, deviceId)', () => {
    const exporter = new WitnessExporter();
    const json = exporter.exportPublicKey(KEY, DEVICE);

    const parsed = JSON.parse(json);
    expect(parsed.algorithm).toBe('hmac-sha256');
    expect(parsed.key).toBe(KEY.toString('hex'));
    expect(parsed.deviceId).toBe('export-dev');
    expect(parsed.exportedAt).toBeTruthy();
  });
});

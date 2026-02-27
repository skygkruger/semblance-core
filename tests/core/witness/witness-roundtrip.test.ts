/**
 * Step 26 — Witness roundtrip test (Commit 7).
 * Tests full cycle: generate -> export -> verify -> valid.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { WitnessGenerator } from '@semblance/core/witness/witness-generator';
import { WitnessVerifier } from '@semblance/core/witness/witness-verifier';
import { WitnessExporter } from '@semblance/core/witness/witness-exporter';
import type { DeviceIdentity, AttestationProof } from '@semblance/core/attestation/types';
import type { WitnessAttestation } from '@semblance/core/witness/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const KEY = Buffer.from('roundtrip-test-key-for-witness-32bytes!');
const DEVICE: DeviceIdentity = { id: 'rt-dev', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('Witness Roundtrip (Step 26)', () => {
  it('full roundtrip: generate -> export -> verify -> valid', () => {
    activatePremium();
    const signer = new AttestationSigner({ signingKey: KEY, deviceIdentity: DEVICE });
    const gen = new WitnessGenerator({
      db: db as unknown as DatabaseHandle,
      premiumGate: gate,
      attestationSigner: signer,
      deviceIdentity: DEVICE,
    });
    gen.initSchema();

    // Generate
    const genResult = gen.generate('audit-rt', 'Roundtrip test action', 'alter_ego');
    expect(genResult.success).toBe(true);

    // Export to JSON and back
    const exporter = new WitnessExporter();
    const json = exporter.exportAsJson(genResult.attestation!);
    const reimported = JSON.parse(json) as WitnessAttestation;

    // Verify
    const verifier = new WitnessVerifier();
    const verification = verifier.verify(reimported, KEY);

    expect(verification.valid).toBe(true);
    expect(verification.signerDevice).toBe('rt-dev');
    expect(verification.timestamp).toBeTruthy();
  });
});

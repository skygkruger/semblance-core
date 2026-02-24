/**
 * Step 26 — WitnessVerifier tests (Commit 7).
 * Tests verification of valid/tampered/wrong-key attestations, and non-premium access.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { WitnessGenerator } from '@semblance/core/witness/witness-generator';
import { WitnessVerifier } from '@semblance/core/witness/witness-verifier';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const SIGNING_KEY = Buffer.from('witness-verifier-test-signing-key-32b!');
const DEVICE: DeviceIdentity = { id: 'verify-dev', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at, license_key)
    VALUES (1, 'digital-representative', ?, NULL, 'sem_test.eyJ0aWVyIjoiZGlnaXRhbC1yZXByZXNlbnRhdGl2ZSJ9.sig')
  `).run(new Date().toISOString());
}

function generateAttestation() {
  activatePremium();
  const signer = new AttestationSigner({ signingKey: SIGNING_KEY, deviceIdentity: DEVICE });
  const gen = new WitnessGenerator({
    db: db as unknown as DatabaseHandle,
    premiumGate: gate,
    attestationSigner: signer,
    deviceIdentity: DEVICE,
  });
  gen.initSchema();
  return gen.generate('audit-v1', 'Sent weekly report', 'partner');
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('WitnessVerifier (Step 26)', () => {
  it('verifies valid attestation returns { valid: true }', () => {
    const result = generateAttestation();
    const verifier = new WitnessVerifier();

    const verification = verifier.verify(result.attestation!, SIGNING_KEY);

    expect(verification.valid).toBe(true);
    expect(verification.signerDevice).toBe('verify-dev');
  });

  it('tampered attestation returns { valid: false }', () => {
    const result = generateAttestation();
    const verifier = new WitnessVerifier();

    // Tamper with the action
    result.attestation!.action = 'TAMPERED ACTION';

    const verification = verifier.verify(result.attestation!, SIGNING_KEY);
    expect(verification.valid).toBe(false);
  });

  it('wrong verification key returns { valid: false }', () => {
    const result = generateAttestation();
    const verifier = new WitnessVerifier();

    const wrongKey = Buffer.from('completely-wrong-verification-key-!!');
    const verification = verifier.verify(result.attestation!, wrongKey);

    expect(verification.valid).toBe(false);
  });

  it('verification works without premium (NOT gated)', () => {
    // Generate with premium...
    const result = generateAttestation();
    // ...then revoke premium
    db.prepare('DELETE FROM license').run();
    expect(gate.isPremium()).toBe(false);

    // Verification should still work — it's a public good
    const verifier = new WitnessVerifier();
    const verification = verifier.verify(result.attestation!, SIGNING_KEY);

    expect(verification.valid).toBe(true);
  });
});

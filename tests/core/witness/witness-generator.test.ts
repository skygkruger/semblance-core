/**
 * Step 26 — WitnessGenerator tests (Commit 6).
 * Tests premium gating, attestation generation, storage, and listing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { AttestationSigner } from '@semblance/core/attestation/attestation-signer';
import { WitnessGenerator } from '@semblance/core/witness/witness-generator';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const TEST_KEY = Buffer.from('witness-generator-test-signing-key-32b!');
const TEST_DEVICE: DeviceIdentity = { id: 'witness-dev-01', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

function createGenerator(): WitnessGenerator {
  const signer = new AttestationSigner({ signingKey: TEST_KEY, deviceIdentity: TEST_DEVICE });
  const gen = new WitnessGenerator({
    db: db as unknown as DatabaseHandle,
    premiumGate: gate,
    attestationSigner: signer,
    deviceIdentity: TEST_DEVICE,
  });
  gen.initSchema();
  return gen;
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('WitnessGenerator (Step 26)', () => {
  it('rejects generation when premium gate is inactive', () => {
    const gen = createGenerator();
    const result = gen.generate('audit-001', 'Sent weekly report email');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Digital Representative');
  });

  it('generates attestation with correct @context and @type', () => {
    activatePremium();
    const gen = createGenerator();
    const result = gen.generate('audit-001', 'Archived newsletters', 'partner');

    expect(result.success).toBe(true);
    expect(result.attestation!['@context']).toBe('https://veridian.run/witness/v1');
    expect(result.attestation!['@type']).toBe('SemblanceWitness');
  });

  it('attestation contains action summary (not full payload — privacy preserved)', () => {
    activatePremium();
    const gen = createGenerator();
    const result = gen.generate('audit-002', 'Drafted reply to manager');

    expect(result.attestation!.action).toBe('Drafted reply to manager');
    expect(result.attestation!.auditEntryId).toBe('audit-002');
  });

  it('attestation contains autonomy tier and device info', () => {
    activatePremium();
    const gen = createGenerator();
    const result = gen.generate('audit-003', 'Scheduled meeting', 'alter_ego');

    expect(result.attestation!.autonomyTier).toBe('alter_ego');
    expect(result.attestation!.device).toEqual(TEST_DEVICE);
  });

  it('stores attestation in witness_attestations table', () => {
    activatePremium();
    const gen = createGenerator();
    const result = gen.generate('audit-004', 'Sent follow-up');

    const stored = gen.getAttestation(result.attestation!.id);
    expect(stored).not.toBeNull();
    expect(stored!.action).toBe('Sent follow-up');
    expect(stored!.proof.type).toBe('HmacSha256Signature');
  });

  it('lists attestations returns stored entries', () => {
    activatePremium();
    const gen = createGenerator();
    gen.generate('a1', 'Action 1');
    gen.generate('a2', 'Action 2');
    gen.generate('a3', 'Action 3');

    const list = gen.listAttestations();
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.action)).toContain('Action 1');
    expect(list.map((a) => a.action)).toContain('Action 3');
  });
});

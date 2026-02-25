// Witness + VTI Bridge Upgrade Tests — Ed25519 public key export, VTI signatureAlgorithm.

import { describe, it, expect, beforeAll } from 'vitest';
import { WitnessExporter } from '@semblance/core/witness/witness-exporter.js';
import { VtiBridge } from '@semblance/core/witness/vti-bridge.js';
import { ED25519_PROOF_TYPE, HMAC_PROOF_TYPE } from '@semblance/core/attestation/attestation-format.js';
import type { WitnessAttestation } from '@semblance/core/witness/types.js';
import { setPlatform } from '@semblance/core/platform/index.js';
import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';
import { randomBytes } from 'node:crypto';

const device = { id: 'test-device-w01', platform: 'desktop' };

beforeAll(() => {
  setPlatform(createDesktopAdapter());
});

function makeAttestation(proofType: string): WitnessAttestation {
  return {
    '@context': 'https://veridian.run/attestation/v1',
    '@type': 'SemblanceWitness',
    id: 'wit_test_001',
    action: 'email.send',
    autonomyTier: 'partner',
    device,
    createdAt: new Date().toISOString(),
    auditEntryId: 'aud_test_001',
    proof: {
      type: proofType,
      created: new Date().toISOString(),
      verificationMethod: `device:${device.id}`,
      proofPurpose: 'assertionMethod',
      proofValue: 'abcdef1234567890',
    },
  };
}

describe('WitnessExporter — Public Key Export', () => {
  it('exports Ed25519 public key with algorithm field', () => {
    const exporter = new WitnessExporter();
    const key = randomBytes(32);
    const json = exporter.exportPublicKey(key, device, 'ed25519');
    const parsed = JSON.parse(json);
    expect(parsed.algorithm).toBe('ed25519');
    expect(parsed.key).toBe(key.toString('hex'));
    expect(parsed.deviceId).toBe('test-device-w01');
  });

  it('exports HMAC key with legacy algorithm field by default', () => {
    const exporter = new WitnessExporter();
    const key = randomBytes(32);
    const json = exporter.exportPublicKey(key, device);
    const parsed = JSON.parse(json);
    expect(parsed.algorithm).toBe('hmac-sha256');
  });

  it('exportAsJson produces valid JSON with proof block', () => {
    const exporter = new WitnessExporter();
    const attestation = makeAttestation(ED25519_PROOF_TYPE);
    const json = exporter.exportAsJson(attestation);
    const parsed = JSON.parse(json);
    expect(parsed.proof.type).toBe(ED25519_PROOF_TYPE);
    expect(parsed['@context']).toBe('https://veridian.run/attestation/v1');
  });
});

describe('VtiBridge — Signature Algorithm Metadata', () => {
  it('includes Ed25519Signature2020 in VTI block for Ed25519 attestations', () => {
    const bridge = new VtiBridge();
    const attestation = makeAttestation(ED25519_PROOF_TYPE);
    const formatted = bridge.formatForVti(attestation);
    const vti = formatted.vti as Record<string, unknown>;
    expect(vti.signatureAlgorithm).toBe(ED25519_PROOF_TYPE);
    expect(vti.registryStatus).toBe('unavailable');
  });

  it('includes HmacSha256Signature in VTI block for HMAC attestations', () => {
    const bridge = new VtiBridge();
    const attestation = makeAttestation(HMAC_PROOF_TYPE);
    const formatted = bridge.formatForVti(attestation);
    const vti = formatted.vti as Record<string, unknown>;
    expect(vti.signatureAlgorithm).toBe(HMAC_PROOF_TYPE);
  });

  it('VTI registry remains unavailable', () => {
    const bridge = new VtiBridge();
    expect(bridge.isRegistryAvailable()).toBe(false);
    expect(bridge.getRegistryRef()).toBeNull();
  });
});

// Migration Detection Tests — Detect legacy crypto formats for guided upgrades.

import { describe, it, expect } from 'vitest';
import { detectLegacyFormats, getMigrationStatus } from '@semblance/core/crypto/migration.js';
import { ED25519_PROOF_TYPE, HMAC_PROOF_TYPE } from '@semblance/core/attestation/attestation-format.js';
import type { SignedAttestation } from '@semblance/core/attestation/types.js';

function makeAttestation(proofType: string): SignedAttestation {
  return {
    payload: { action: 'test' },
    proof: {
      type: proofType,
      created: new Date().toISOString(),
      verificationMethod: 'device:test',
      proofPurpose: 'assertionMethod',
      proofValue: 'deadbeef',
    },
  };
}

describe('Legacy Format Detection', () => {
  it('detects legacy v1 archive format (no kdf field)', () => {
    const report = detectLegacyFormats(
      { version: 1, encrypted: true, createdAt: new Date().toISOString() },
      null,
    );
    expect(report.archiveVersion).toBe('v1-sha256');
  });

  it('detects legacy HMAC attestation format', () => {
    const report = detectLegacyFormats(
      null,
      makeAttestation(HMAC_PROOF_TYPE),
    );
    expect(report.attestationProofType).toBe('hmac-sha256');
  });

  it('reports v2 archive as current', () => {
    const report = detectLegacyFormats(
      { version: 2, encrypted: true, createdAt: new Date().toISOString(), kdf: 'argon2id', salt: 'aabb' },
      null,
    );
    expect(report.archiveVersion).toBe('v2-argon2id');
  });

  it('reports Ed25519 attestation as current', () => {
    const report = detectLegacyFormats(
      null,
      makeAttestation(ED25519_PROOF_TYPE),
    );
    expect(report.attestationProofType).toBe('ed25519');
  });
});

describe('Migration Status Report', () => {
  it('getMigrationStatus returns structured report with legacy and current', () => {
    const status = getMigrationStatus(
      { version: 1, encrypted: true, createdAt: new Date().toISOString() },
      makeAttestation(ED25519_PROOF_TYPE),
    );
    expect(status.archive.status).toBe('legacy');
    expect(status.archive.details).toContain('SHA-256');
    expect(status.archive.details).toContain('Argon2id');
    expect(status.attestation.status).toBe('current');
    expect(status.attestation.details).toContain('Ed25519');
  });
});

// Migration Detection — Detects legacy cryptographic formats for guided upgrades.
// Reports v1 archives and HMAC attestations that can be re-encrypted/re-signed.
// CRITICAL: No networking imports.

import type { EncryptedArchive } from '../living-will/types.js';
import type { SignedAttestation } from '../attestation/types.js';
import { ED25519_PROOF_TYPE } from '../attestation/attestation-format.js';

export interface LegacyFormatReport {
  archiveVersion: 'v1-sha256' | 'v2-argon2id' | 'unknown' | null;
  attestationProofType: 'hmac-sha256' | 'ed25519' | 'unknown' | null;
}

export type MigrationItemStatus = 'current' | 'legacy' | 'unknown';

export interface MigrationStatus {
  archive: { status: MigrationItemStatus; details: string };
  attestation: { status: MigrationItemStatus; details: string };
}

/**
 * Detect legacy cryptographic formats in existing artifacts.
 * Used for migration reporting — does NOT perform upgrades.
 */
export function detectLegacyFormats(
  archiveHeader?: EncryptedArchive['header'] | null,
  attestationJson?: SignedAttestation | null,
): LegacyFormatReport {
  let archiveVersion: LegacyFormatReport['archiveVersion'] = null;
  let attestationProofType: LegacyFormatReport['attestationProofType'] = null;

  if (archiveHeader) {
    if (archiveHeader.kdf === 'argon2id') {
      archiveVersion = 'v2-argon2id';
    } else if (archiveHeader.version === 1 || !archiveHeader.kdf) {
      archiveVersion = 'v1-sha256';
    } else {
      archiveVersion = 'unknown';
    }
  }

  if (attestationJson) {
    const proofType = attestationJson.proof?.type;
    if (proofType === ED25519_PROOF_TYPE) {
      attestationProofType = 'ed25519';
    } else if (proofType === 'HmacSha256Signature') {
      attestationProofType = 'hmac-sha256';
    } else {
      attestationProofType = 'unknown';
    }
  }

  return { archiveVersion, attestationProofType };
}

/**
 * Get a structured migration status report.
 */
export function getMigrationStatus(
  archiveHeader?: EncryptedArchive['header'] | null,
  attestationJson?: SignedAttestation | null,
): MigrationStatus {
  const report = detectLegacyFormats(archiveHeader, attestationJson);

  const archiveStatus: MigrationItemStatus =
    report.archiveVersion === 'v2-argon2id' ? 'current' :
    report.archiveVersion === 'v1-sha256' ? 'legacy' :
    report.archiveVersion === null ? 'unknown' : 'unknown';

  const attestationStatus: MigrationItemStatus =
    report.attestationProofType === 'ed25519' ? 'current' :
    report.attestationProofType === 'hmac-sha256' ? 'legacy' :
    report.attestationProofType === null ? 'unknown' : 'unknown';

  return {
    archive: {
      status: archiveStatus,
      details: report.archiveVersion === 'v1-sha256'
        ? 'Archive uses SHA-256 key derivation. Re-export with current version to upgrade to Argon2id.'
        : report.archiveVersion === 'v2-argon2id'
        ? 'Archive uses Argon2id key derivation (current).'
        : 'No archive data to evaluate.',
    },
    attestation: {
      status: attestationStatus,
      details: report.attestationProofType === 'hmac-sha256'
        ? 'Attestation uses HMAC-SHA256 (symmetric). Re-sign with Ed25519 for asymmetric verification.'
        : report.attestationProofType === 'ed25519'
        ? 'Attestation uses Ed25519 (current).'
        : 'No attestation data to evaluate.',
    },
  };
}

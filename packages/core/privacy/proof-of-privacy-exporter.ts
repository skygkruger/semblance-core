// Proof of Privacy Exporter — Signs and exports reports as JSON.
// Verification is NOT premium-gated (public good).
// CRITICAL: No networking imports.

import type { AttestationSigner } from '../attestation/attestation-signer.js';
import { AttestationVerifier } from '../attestation/attestation-verifier.js';
import type { ProofOfPrivacyReport, ProofOfPrivacyExportResult, ProofOfPrivacyVerificationResult, SignedProofOfPrivacy } from './types.js';

export interface ProofOfPrivacyExporterDeps {
  attestationSigner: AttestationSigner;
}

/**
 * Exports Proof of Privacy reports as signed JSON.
 * Provides verification without premium gate.
 */
export class ProofOfPrivacyExporter {
  private signer: AttestationSigner;

  constructor(deps: ProofOfPrivacyExporterDeps) {
    this.signer = deps.attestationSigner;
  }

  /**
   * Sign a report and export as JSON string.
   */
  export(report: ProofOfPrivacyReport): ProofOfPrivacyExportResult {
    const attestation = this.signer.sign(report as unknown as Record<string, unknown>);

    const signedReport: SignedProofOfPrivacy = {
      report,
      attestation,
    };

    return {
      signedReport,
      json: JSON.stringify(signedReport, null, 2),
    };
  }

  /**
   * Verify a signed report against a verification key.
   * NOT premium-gated — verification is a public good.
   */
  verify(json: string, verificationKey: Buffer): ProofOfPrivacyVerificationResult {
    const verifier = new AttestationVerifier();

    let parsed: SignedProofOfPrivacy;
    try {
      parsed = JSON.parse(json) as SignedProofOfPrivacy;
    } catch {
      return { valid: false };
    }

    if (!parsed.attestation) {
      return { valid: false };
    }

    const result = verifier.verify(parsed.attestation, verificationKey);

    return {
      valid: result.valid,
      signerDevice: result.signerDevice,
      timestamp: result.timestamp,
    };
  }
}

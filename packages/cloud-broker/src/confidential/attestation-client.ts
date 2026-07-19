import type {
  AttestationNonceGuard,
  AttestationVerificationContext,
  AttestationVerificationResult,
} from '@semblance/kernel';

export interface AttestationFetchParams {
  readonly workloadId: string;
  readonly nonce?: string;
}

/** Injectable fetcher — Broker never opens sockets; caller supplies network I/O. */
export interface AttestationEvidenceFetcher {
  fetchEvidence(params: AttestationFetchParams): Promise<unknown>;
}

export type AttestationVerifier = (
  evidence: unknown,
  context: AttestationVerificationContext,
) => AttestationVerificationResult;

export interface AttestationClientConfig {
  readonly fetcher: AttestationEvidenceFetcher;
  readonly verifier: AttestationVerifier;
  readonly expectedWorkloadId: string;
  readonly expectedPolicyVersion?: string;
  readonly nonceGuard?: AttestationNonceGuard;
}

export interface VerifyAndBindParams {
  /** When provided, skips fetcher (evidence already retrieved out-of-band). */
  readonly evidence?: unknown;
  readonly nowMs?: number;
}

/**
 * Retrieves attestation evidence via injected fetcher and verifies through Kernel.
 * Returns bound ephemeral public key only when Kernel allows.
 */
export class AttestationClient {
  private readonly fetcher: AttestationEvidenceFetcher;
  private readonly verifier: AttestationVerifier;
  private readonly expectedWorkloadId: string;
  private readonly expectedPolicyVersion?: string;
  private readonly nonceGuard?: AttestationNonceGuard;

  constructor(config: AttestationClientConfig) {
    this.fetcher = config.fetcher;
    this.verifier = config.verifier;
    this.expectedWorkloadId = config.expectedWorkloadId;
    this.expectedPolicyVersion = config.expectedPolicyVersion;
    this.nonceGuard = config.nonceGuard;
  }

  async verifyAndBind(params: VerifyAndBindParams = {}): Promise<AttestationVerificationResult> {
    const evidence = params.evidence ?? await this.fetcher.fetchEvidence({
      workloadId: this.expectedWorkloadId,
    });

    return this.verifier(evidence, {
      expectedWorkloadId: this.expectedWorkloadId,
      expectedPolicyVersion: this.expectedPolicyVersion,
      nonceGuard: this.nonceGuard,
      nowMs: params.nowMs,
    });
  }
}

export interface ConfidentialAttestationEvidence {
  readonly protocolVersion: 1;
  readonly evidenceId: string;
  readonly nonce: string;
  readonly workloadId: string;
  readonly measurement: string;
  readonly policyVersion: string;
  readonly tcbVersion: string;
  readonly ephemeralPublicKey: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly issuerKeyId: string;
  readonly signature: string;
}

export interface AttestationVerificationContext {
  readonly expectedWorkloadId: string;
  readonly expectedPolicyVersion?: string;
  readonly nowMs?: number;
  readonly nonceGuard?: AttestationNonceGuard;
}

export interface AttestationVerificationResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly boundEphemeralPublicKey?: string;
}

export interface AttestationNonceGuard {
  tryConsume(nonce: string, validUntilMs: number, nowMs: number): boolean;
  purgeExpired(nowMs: number): void;
}

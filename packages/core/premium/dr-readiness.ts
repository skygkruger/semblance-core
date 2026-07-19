/**
 * Paid Digital Representative readiness gate.
 * Premium users require a present, valid signed artifact before DR features activate.
 */

export class DigitalRepresentativeNotReadyError extends Error {
  readonly code = 'DR_NOT_READY';

  constructor(message: string) {
    super(message);
    this.name = 'DigitalRepresentativeNotReadyError';
  }
}

export interface DigitalRepresentativeReadinessInput {
  isPremium: boolean;
  artifactPresent: boolean;
  artifactValid: boolean;
}

export interface DigitalRepresentativeReadinessResult {
  ready: boolean;
  reason?: string;
}

export function evaluateDigitalRepresentativeReadiness(
  input: DigitalRepresentativeReadinessInput,
): DigitalRepresentativeReadinessResult {
  if (!input.isPremium) {
    return { ready: true };
  }
  if (!input.artifactPresent) {
    return {
      ready: false,
      reason: 'Signed Digital Representative artifact is not configured',
    };
  }
  if (!input.artifactValid) {
    return {
      ready: false,
      reason: 'Signed Digital Representative artifact failed verification',
    };
  }
  return { ready: true };
}

export function assertDigitalRepresentativeReady(
  input: DigitalRepresentativeReadinessInput,
): void {
  const result = evaluateDigitalRepresentativeReadiness(input);
  if (!result.ready) {
    throw new DigitalRepresentativeNotReadyError(result.reason ?? 'Digital Representative not ready');
  }
}

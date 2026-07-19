import { describe, expect, it } from 'vitest';
import {
  decideExecutionDestination,
  isExecutionDestinationRemote,
  type ExecutionDestinationPolicyInput,
} from '../src/policy/execution-destination-policy.js';

function baseInput(
  overrides: Partial<ExecutionDestinationPolicyInput> = {},
): ExecutionDestinationPolicyInput {
  return {
    sensitivity: 30,
    localFeasibility: true,
    destinationTrust: {
      selfHosted: 'verified',
      byo: 'verified',
      confidential: 'attested',
    },
    userPreference: 'auto',
    disclosureCeiling: 80,
    attestationAvailable: true,
    localOnlyKillSwitch: false,
    explicitConsent: false,
    ...overrides,
  };
}

describe('decideExecutionDestination', () => {
  describe('localOnlyKillSwitch', () => {
    it('forces local when local is feasible', () => {
      const result = decideExecutionDestination(
        baseInput({
          localOnlyKillSwitch: true,
          userPreference: 'byo',
          explicitConsent: true,
        }),
      );

      expect(result).toEqual({
        destination: 'local',
        reason: 'local_only_kill_switch',
      });
    });

    it('rejects remote when kill switch is on and local is not feasible', () => {
      const result = decideExecutionDestination(
        baseInput({
          localOnlyKillSwitch: true,
          localFeasibility: false,
          userPreference: 'byo',
          explicitConsent: true,
        }),
      );

      expect(result.destination).toBe('reject');
      expect(result.reason).toBe('local_only_kill_switch_blocks_remote');
    });
  });

  describe('sensitivity and disclosureCeiling', () => {
    it('rejects remote when sensitivity exceeds disclosure ceiling', () => {
      const result = decideExecutionDestination(
        baseInput({
          sensitivity: 90,
          disclosureCeiling: 60,
          userPreference: 'byo',
          explicitConsent: true,
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'sensitivity_exceeds_disclosure_ceiling',
      });
    });

    it('allows local even when sensitivity exceeds disclosure ceiling', () => {
      const result = decideExecutionDestination(
        baseInput({
          sensitivity: 95,
          disclosureCeiling: 40,
          userPreference: 'local',
        }),
      );

      expect(result.destination).toBe('local');
    });
  });

  describe('localFeasibility and userPreference', () => {
    it('prefers local for auto when local is feasible', () => {
      const result = decideExecutionDestination(baseInput({ userPreference: 'auto' }));

      expect(result).toEqual({
        destination: 'local',
        reason: 'local_feasible_preferred',
      });
    });

    it('rejects when local is requested but not feasible', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'local',
          localFeasibility: false,
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'local_preferred_but_not_feasible',
      });
    });
  });

  describe('self_hosted destination', () => {
    it('selects self_hosted when preferred, trusted, and consented', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'self_hosted',
          explicitConsent: true,
        }),
      );

      expect(result).toEqual({
        destination: 'self_hosted',
        reason: 'self_hosted_approved',
      });
    });

    it('rejects self_hosted when trust is insufficient', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'self_hosted',
          explicitConsent: true,
          destinationTrust: { selfHosted: 'unverified' },
        }),
      );

      expect(result.destination).toBe('reject');
      expect(result.reason).toContain('destination_trust_insufficient:self_hosted');
    });
  });

  describe('byo destination', () => {
    it('selects byo when preferred, trusted, and consented', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'byo',
          explicitConsent: true,
        }),
      );

      expect(result).toEqual({
        destination: 'byo',
        reason: 'byo_approved',
      });
    });

    it('rejects byo for confidential-labeled tasks', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'byo',
          explicitConsent: true,
          labeledConfidential: true,
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'byo_not_permitted_for_confidential_labeled_task',
      });
    });
  });

  describe('confidential destination', () => {
    it('selects confidential when attestation is available and trust is attested', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'confidential',
          explicitConsent: true,
          attestationAvailable: true,
          destinationTrust: { confidential: 'attested' },
        }),
      );

      expect(result).toEqual({
        destination: 'confidential',
        reason: 'confidential_approved',
      });
    });

    it('rejects confidential when attestation is unavailable', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'confidential',
          explicitConsent: true,
          attestationAvailable: false,
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'confidential_requires_attestation',
      });
    });

    it('rejects confidential when trust is not attested', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'confidential',
          explicitConsent: true,
          destinationTrust: { confidential: 'verified' },
        }),
      );

      expect(result.destination).toBe('reject');
      expect(result.reason).toContain('destination_trust_insufficient:confidential');
    });
  });

  describe('ask and explicitConsent', () => {
    it('returns ask for remote preference without explicit consent', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'byo',
          explicitConsent: false,
        }),
      );

      expect(result).toEqual({
        destination: 'ask',
        reason: 'explicit_consent_required',
        requiresConsent: true,
      });
    });

    it('returns ask when user preference is ask', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'ask',
          localFeasibility: false,
        }),
      );

      expect(result.destination).toBe('ask');
      expect(result.requiresConsent).toBe(true);
    });

    it('proceeds to remote destination when explicit consent is granted', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'byo',
          explicitConsent: true,
        }),
      );

      expect(result.destination).toBe('byo');
    });

    it('resolves ask preference to a feasible remote destination after consent', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'ask',
          localFeasibility: false,
          explicitConsent: true,
        }),
      );

      expect(result.destination).toBe('self_hosted');
    });
  });

  describe('cost, latency, and retention constraints', () => {
    it('rejects when cost exceeds budget', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'byo',
          explicitConsent: true,
          cost: { budgetCents: 100, estimatedCents: 250 },
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'cost_exceeds_budget',
      });
    });

    it('rejects when latency exceeds limit', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'self_hosted',
          explicitConsent: true,
          latency: { maxMs: 500, estimatedMs: 1200 },
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'latency_exceeds_limit',
      });
    });

    it('rejects when retention exceeds policy', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'byo',
          explicitConsent: true,
          retention: { maxDays: 7, destinationDays: 30 },
        }),
      );

      expect(result).toEqual({
        destination: 'reject',
        reason: 'retention_exceeds_policy',
      });
    });
  });

  describe('auto fallback without local feasibility', () => {
    it('returns ask for auto when local is not feasible and consent is missing', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'auto',
          localFeasibility: false,
        }),
      );

      expect(result.destination).toBe('ask');
      expect(result.requiresConsent).toBe(true);
    });

    it('falls back to self_hosted for auto when local is not feasible and consent is granted', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'auto',
          localFeasibility: false,
          explicitConsent: true,
        }),
      );

      expect(result.destination).toBe('self_hosted');
    });

    it('rejects auto when no remote destination is feasible', () => {
      const result = decideExecutionDestination(
        baseInput({
          userPreference: 'auto',
          localFeasibility: false,
          explicitConsent: true,
          destinationTrust: {
            selfHosted: 'none',
            byo: 'none',
            confidential: 'none',
          },
          attestationAvailable: false,
        }),
      );

      expect(result.destination).toBe('reject');
      expect(result.reason).toBe('no_feasible_remote_destination');
    });
  });
});

describe('isExecutionDestinationRemote', () => {
  it('identifies remote destinations', () => {
    expect(isExecutionDestinationRemote('self_hosted')).toBe(true);
    expect(isExecutionDestinationRemote('byo')).toBe(true);
    expect(isExecutionDestinationRemote('confidential')).toBe(true);
    expect(isExecutionDestinationRemote('local')).toBe(false);
    expect(isExecutionDestinationRemote('ask')).toBe(false);
    expect(isExecutionDestinationRemote('reject')).toBe(false);
  });
});

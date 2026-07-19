/**
 * Kernel execution destination policy — sole authority for where inference runs.
 * Pure decision function: no network, no I/O.
 */

export type ExecutionDestinationChoice =
  | 'local'
  | 'self_hosted'
  | 'byo'
  | 'confidential'
  | 'ask'
  | 'reject';

export type UserDestinationPreference =
  | 'local'
  | 'auto'
  | 'self_hosted'
  | 'byo'
  | 'confidential'
  | 'ask';

export type RemoteExecutionDestination = 'self_hosted' | 'byo' | 'confidential';

export type DestinationTrustStatus = 'none' | 'unverified' | 'verified' | 'attested';

export interface DestinationTrustFacts {
  readonly selfHosted?: DestinationTrustStatus;
  readonly byo?: DestinationTrustStatus;
  readonly confidential?: DestinationTrustStatus;
}

export interface ExecutionCostFacts {
  readonly budgetCents: number;
  readonly estimatedCents: number;
}

export interface ExecutionLatencyFacts {
  readonly maxMs: number;
  readonly estimatedMs: number;
}

export interface ExecutionRetentionFacts {
  readonly maxDays: number;
  readonly destinationDays: number;
}

export interface ExecutionDestinationPolicyInput {
  /** Task sensitivity on a 0–100 scale (higher = more sensitive). */
  readonly sensitivity: number;
  readonly localFeasibility: boolean;
  readonly destinationTrust: DestinationTrustFacts;
  readonly userPreference: UserDestinationPreference;
  /** Maximum sensitivity permitted for remote disclosure on a 0–100 scale. */
  readonly disclosureCeiling: number;
  readonly cost?: ExecutionCostFacts;
  readonly latency?: ExecutionLatencyFacts;
  readonly retention?: ExecutionRetentionFacts;
  readonly attestationAvailable: boolean;
  readonly localOnlyKillSwitch: boolean;
  readonly explicitConsent: boolean;
  /** When true, BYO destinations must not receive the task. */
  readonly labeledConfidential?: boolean;
}

export interface ExecutionDestinationDecision {
  readonly destination: ExecutionDestinationChoice;
  readonly reason: string;
  readonly requiresConsent?: boolean;
}

const REMOTE_DESTINATIONS: readonly RemoteExecutionDestination[] = [
  'self_hosted',
  'byo',
  'confidential',
];

function isRemoteDestination(
  destination: ExecutionDestinationChoice,
): destination is RemoteExecutionDestination {
  return (REMOTE_DESTINATIONS as readonly string[]).includes(destination);
}

function remotePreference(
  preference: UserDestinationPreference,
): RemoteExecutionDestination | null {
  if (preference === 'self_hosted' || preference === 'byo' || preference === 'confidential') {
    return preference;
  }
  return null;
}

function trustForDestination(
  destination: RemoteExecutionDestination,
  trust: DestinationTrustFacts,
): DestinationTrustStatus {
  switch (destination) {
    case 'self_hosted':
      return trust.selfHosted ?? 'none';
    case 'byo':
      return trust.byo ?? 'none';
    case 'confidential':
      return trust.confidential ?? 'none';
  }
}

function isTrustSufficient(
  destination: RemoteExecutionDestination,
  status: DestinationTrustStatus,
): boolean {
  if (destination === 'confidential') {
    return status === 'attested';
  }
  return status === 'verified' || status === 'attested';
}

function checkOperationalConstraints(
  input: ExecutionDestinationPolicyInput,
): ExecutionDestinationDecision | null {
  if (input.cost && input.cost.estimatedCents > input.cost.budgetCents) {
    return {
      destination: 'reject',
      reason: 'cost_exceeds_budget',
    };
  }

  if (input.latency && input.latency.estimatedMs > input.latency.maxMs) {
    return {
      destination: 'reject',
      reason: 'latency_exceeds_limit',
    };
  }

  if (input.retention && input.retention.destinationDays > input.retention.maxDays) {
    return {
      destination: 'reject',
      reason: 'retention_exceeds_policy',
    };
  }

  return null;
}

function checkRemoteDestination(
  destination: RemoteExecutionDestination,
  input: ExecutionDestinationPolicyInput,
): ExecutionDestinationDecision {
  if (input.sensitivity > input.disclosureCeiling) {
    return {
      destination: 'reject',
      reason: 'sensitivity_exceeds_disclosure_ceiling',
    };
  }

  if (destination === 'byo' && input.labeledConfidential) {
    return {
      destination: 'reject',
      reason: 'byo_not_permitted_for_confidential_labeled_task',
    };
  }

  if (destination === 'confidential') {
    if (!input.attestationAvailable) {
      return {
        destination: 'reject',
        reason: 'confidential_requires_attestation',
      };
    }
  }

  const trustStatus = trustForDestination(destination, input.destinationTrust);
  if (!isTrustSufficient(destination, trustStatus)) {
    return {
      destination: 'reject',
      reason: `destination_trust_insufficient:${destination}:${trustStatus}`,
    };
  }

  const constraintViolation = checkOperationalConstraints(input);
  if (constraintViolation) {
    return constraintViolation;
  }

  return {
    destination,
    reason: `${destination}_approved`,
  };
}

function autoRemoteFallback(
  input: ExecutionDestinationPolicyInput,
): RemoteExecutionDestination | null {
  const candidates: RemoteExecutionDestination[] = ['self_hosted', 'byo', 'confidential'];
  for (const candidate of candidates) {
    const decision = checkRemoteDestination(candidate, input);
    if (decision.destination === candidate) {
      return candidate;
    }
  }
  return null;
}

/**
 * Decide where a task may execute. Kernel is the sole authority; callers supply facts only.
 */
export function decideExecutionDestination(
  input: ExecutionDestinationPolicyInput,
): ExecutionDestinationDecision {
  if (input.localOnlyKillSwitch) {
    if (input.localFeasibility) {
      return {
        destination: 'local',
        reason: 'local_only_kill_switch',
      };
    }
    return {
      destination: 'reject',
      reason: 'local_only_kill_switch_blocks_remote',
    };
  }

  if (input.userPreference === 'local') {
    if (input.localFeasibility) {
      return {
        destination: 'local',
        reason: 'local_preferred_and_feasible',
      };
    }
    return {
      destination: 'reject',
      reason: 'local_preferred_but_not_feasible',
    };
  }

  if (input.userPreference === 'auto' && input.localFeasibility) {
    return {
      destination: 'local',
      reason: 'local_feasible_preferred',
    };
  }

  const explicitRemote = remotePreference(input.userPreference);
  if (explicitRemote && input.sensitivity > input.disclosureCeiling) {
    return {
      destination: 'reject',
      reason: 'sensitivity_exceeds_disclosure_ceiling',
    };
  }

  const needsConsent =
    input.userPreference === 'ask' ||
    explicitRemote !== null ||
    (input.userPreference === 'auto' && !input.localFeasibility);

  if (needsConsent && !input.explicitConsent) {
    return {
      destination: 'ask',
      reason: 'explicit_consent_required',
      requiresConsent: true,
    };
  }

  let targetRemote = explicitRemote;
  if (!targetRemote && (input.userPreference === 'auto' || input.userPreference === 'ask')) {
    targetRemote = autoRemoteFallback(input);
    if (!targetRemote) {
      return {
        destination: 'reject',
        reason: 'no_feasible_remote_destination',
      };
    }
  }

  if (targetRemote) {
    return checkRemoteDestination(targetRemote, input);
  }

  if (input.localFeasibility) {
    return {
      destination: 'local',
      reason: 'local_feasible_default',
    };
  }

  return {
    destination: 'reject',
    reason: 'no_feasible_destination',
  };
}

export function isExecutionDestinationRemote(
  destination: ExecutionDestinationChoice,
): destination is RemoteExecutionDestination {
  return isRemoteDestination(destination);
}

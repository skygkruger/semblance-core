/**
 * Per-capability autonomy policy — Guardian / Partner / Alter Ego scoped by action,
 * destination, sensitivity, and prior approvals for the same capability (never cross-grant).
 */

export type AutonomyTier = 'guardian' | 'partner' | 'alter_ego';

export type CapabilityActionType = 'email.send' | 'email.draft' | 'calendar.create';

export interface CapabilityPolicy {
  readonly requiresApproval: boolean;
  readonly maxSensitivity: number;
  readonly maxValueMinorUnits?: number;
  readonly allowedDestinations?: readonly string[];
  readonly novelDestinationApprovalThreshold?: number;
}

export interface EvaluateAutonomyCapabilityInput {
  readonly tier: AutonomyTier;
  readonly action: string;
  readonly account?: string;
  readonly destination?: string;
  readonly sensitivity?: number;
  readonly valueMinorUnits?: number;
  readonly priorApprovalsForThisCapability?: number;
}

export interface AutonomyCapabilityEvaluation {
  readonly allow: boolean;
  readonly requiresApproval: boolean;
  readonly reason: string;
}

export const CAPABILITY_ACTION_TYPES: readonly CapabilityActionType[] = [
  'email.send',
  'email.draft',
  'calendar.create',
];

const CAPABILITY_ACTION_SET = new Set<string>(CAPABILITY_ACTION_TYPES);

export const AUTONOMY_CAPABILITY_MAP: Record<
  AutonomyTier,
  Partial<Record<CapabilityActionType, CapabilityPolicy>>
> = {
  guardian: {
    'email.send': {
      requiresApproval: true,
      maxSensitivity: 100,
    },
    'email.draft': {
      requiresApproval: true,
      maxSensitivity: 100,
    },
    'calendar.create': {
      requiresApproval: true,
      maxSensitivity: 100,
    },
  },
  partner: {
    'email.draft': {
      requiresApproval: false,
      maxSensitivity: 80,
    },
    'email.send': {
      requiresApproval: false,
      maxSensitivity: 60,
      novelDestinationApprovalThreshold: 3,
    },
    'calendar.create': {
      requiresApproval: false,
      maxSensitivity: 70,
    },
  },
  alter_ego: {
    'email.draft': {
      requiresApproval: false,
      maxSensitivity: 90,
    },
    'email.send': {
      requiresApproval: false,
      maxSensitivity: 85,
      maxValueMinorUnits: 1_000_000,
    },
    'calendar.create': {
      requiresApproval: false,
      maxSensitivity: 85,
      maxValueMinorUnits: 500_000,
    },
  },
};

const ALTER_EGO_HIGH_STAKES_SENSITIVITY = 90;
const ALTER_EGO_HIGH_STAKES_VALUE_MINOR = 500_000;

function normalizeDestination(destination: string): string {
  return destination.trim().toLowerCase();
}

export function extractActionDestination(
  action: string,
  payload: Record<string, unknown>,
): string | undefined {
  if (action === 'email.send' || action === 'email.draft') {
    const to = payload['to'];
    if (Array.isArray(to) && typeof to[0] === 'string') {
      return to[0];
    }
    if (typeof to === 'string') {
      return to;
    }
  }

  if (action === 'calendar.create') {
    const attendees = payload['attendees'];
    if (Array.isArray(attendees) && typeof attendees[0] === 'string') {
      return attendees[0];
    }
    const organizer = payload['organizer'];
    if (typeof organizer === 'string') {
      return organizer;
    }
  }

  return undefined;
}

export function isCapabilityScopedAction(action: string): action is CapabilityActionType {
  return CAPABILITY_ACTION_SET.has(action);
}

export function evaluateAutonomyCapability(
  input: EvaluateAutonomyCapabilityInput,
): AutonomyCapabilityEvaluation {
  const priorApprovals = input.priorApprovalsForThisCapability ?? 0;
  const sensitivity = input.sensitivity ?? 0;

  if (!isCapabilityScopedAction(input.action)) {
    return evaluateTierDefault(input.tier, priorApprovals);
  }

  const policy = AUTONOMY_CAPABILITY_MAP[input.tier][input.action];
  if (!policy) {
    return evaluateTierDefault(input.tier, priorApprovals);
  }

  if (policy.requiresApproval) {
    return {
      allow: true,
      requiresApproval: true,
      reason: `${input.tier} policy requires approval for ${input.action}`,
    };
  }

  if (sensitivity > policy.maxSensitivity) {
    return {
      allow: input.tier !== 'guardian',
      requiresApproval: true,
      reason: `Sensitivity ${sensitivity} exceeds ${policy.maxSensitivity} for ${input.action}`,
    };
  }

  if (
    policy.maxValueMinorUnits !== undefined
    && input.valueMinorUnits !== undefined
    && input.valueMinorUnits > policy.maxValueMinorUnits
  ) {
    return {
      allow: true,
      requiresApproval: true,
      reason: `Value ${input.valueMinorUnits} exceeds ${policy.maxValueMinorUnits} minor units for ${input.action}`,
    };
  }

  if (input.destination) {
    const normalizedDestination = normalizeDestination(input.destination);
    const allowedDestinations = policy.allowedDestinations?.map(normalizeDestination) ?? [];
    const isKnownDestination = allowedDestinations.includes(normalizedDestination);
    const threshold = policy.novelDestinationApprovalThreshold;

    if (threshold !== undefined) {
      if (priorApprovals < threshold && (!input.destination || !isKnownDestination)) {
        return {
          allow: true,
          requiresApproval: true,
          reason: input.destination
            ? `Novel destination ${input.destination} requires ${threshold} prior ${input.action} approvals (have ${priorApprovals})`
            : `${input.action} requires ${threshold} prior approvals before autonomous execution (have ${priorApprovals})`,
        };
      }
    }
  } else if (policy.novelDestinationApprovalThreshold !== undefined) {
    const threshold = policy.novelDestinationApprovalThreshold;
    if (priorApprovals < threshold) {
      return {
        allow: true,
        requiresApproval: true,
        reason: `${input.action} requires ${threshold} prior approvals before autonomous execution (have ${priorApprovals})`,
      };
    }
  }

  if (input.tier === 'alter_ego' && input.action === 'email.send') {
    if (
      sensitivity >= ALTER_EGO_HIGH_STAKES_SENSITIVITY
      || (input.valueMinorUnits !== undefined && input.valueMinorUnits >= ALTER_EGO_HIGH_STAKES_VALUE_MINOR)
    ) {
      return {
        allow: true,
        requiresApproval: true,
        reason: 'Alter Ego high-stakes email.send still requires approval',
      };
    }
  }

  return {
    allow: true,
    requiresApproval: false,
    reason: 'Capability policy permits autonomous execution',
  };
}

function evaluateTierDefault(
  tier: AutonomyTier,
  priorApprovals: number,
): AutonomyCapabilityEvaluation {
  if (tier === 'guardian') {
    return {
      allow: true,
      requiresApproval: true,
      reason: 'Guardian tier requires approval for unmapped actions',
    };
  }

  if (tier === 'partner') {
    return {
      allow: true,
      requiresApproval: priorApprovals < 3,
      reason: priorApprovals < 3
        ? 'Partner tier requires approval until capability routine threshold is met'
        : 'Partner tier permits autonomous execution for unmapped actions',
    };
  }

  return {
    allow: true,
    requiresApproval: false,
    reason: 'Alter Ego tier permits autonomous execution for unmapped actions',
  };
}

export function capabilityEscalationWouldHelp(
  action: string,
  consecutiveApprovals: number,
  destination?: string,
): boolean {
  const guardian = evaluateAutonomyCapability({
    tier: 'guardian',
    action,
    destination,
    priorApprovalsForThisCapability: consecutiveApprovals,
  });
  const partner = evaluateAutonomyCapability({
    tier: 'partner',
    action,
    destination,
    priorApprovalsForThisCapability: consecutiveApprovals,
  });

  return guardian.requiresApproval && !partner.requiresApproval;
}

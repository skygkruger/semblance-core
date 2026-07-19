import type { SharedSpaceRole } from '@semblance/protocol';
import {
  decideExecutionDestination,
  type ExecutionDestinationDecision,
  type ExecutionDestinationPolicyInput,
  type UserDestinationPreference,
} from '../policy/execution-destination-policy.js';

export type CapabilityScope = 'user' | 'shared_space' | 'organization';

export type SensitiveSharedAction =
  | 'publish_personal_to_shared'
  | 'shared_delete'
  | 'org_destination_override'
  | 'legal_hold';

export const SENSITIVE_SHARED_ACTIONS: readonly SensitiveSharedAction[] = [
  'publish_personal_to_shared',
  'shared_delete',
  'org_destination_override',
  'legal_hold',
] as const;

export type SharedSpacePolicyAction =
  | SensitiveSharedAction
  | 'read_personal_vault'
  | 'grant_personal_capability'
  | 'read_shared_vault'
  | 'write_shared_vault'
  | 'read_organization_data'
  | 'write_organization_data';

export interface SharedSpacePolicyActor {
  readonly memberId: string;
  readonly role: SharedSpaceRole;
  readonly personalRootId: string;
}

export interface SharedSpacePolicySpace {
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly activeMemberIds: readonly string[];
}

export interface SharedSpacePolicyApproval {
  readonly approverMemberId: string;
  readonly actionId: string;
  readonly approvedAt: string;
}

export interface SharedSpacePolicyActionRequest {
  readonly actionId: string;
  readonly type: SharedSpacePolicyAction;
  readonly scope: CapabilityScope;
  /** Required for user-scoped reads/grants/publications. */
  readonly targetMemberId?: string;
}

export interface EvaluateSharedActionInput {
  readonly actor: SharedSpacePolicyActor;
  readonly space: SharedSpacePolicySpace;
  readonly action: SharedSpacePolicyActionRequest;
  readonly approvals: readonly SharedSpacePolicyApproval[];
}

export type SharedActionEvaluation = 'allow' | 'deny' | 'needs_approval';

export class SharedSpacePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedSpacePolicyError';
  }
}

function isPrivilegedRole(role: SharedSpaceRole): boolean {
  return role === 'admin' || role === 'owner';
}

function isSensitiveAction(action: SharedSpacePolicyAction): action is SensitiveSharedAction {
  return (SENSITIVE_SHARED_ACTIONS as readonly string[]).includes(action);
}

function actorControlsPersonalTarget(
  actor: SharedSpacePolicyActor,
  targetMemberId: string | undefined,
): boolean {
  if (!targetMemberId) {
    return false;
  }
  return actor.memberId === targetMemberId;
}

function hasDualApproval(
  actionId: string,
  actorMemberId: string,
  approvals: readonly SharedSpacePolicyApproval[],
  activeMemberIds: readonly string[],
): boolean {
  const distinctApprovers = new Set<string>();
  for (const approval of approvals) {
    if (approval.actionId !== actionId) {
      continue;
    }
    if (!activeMemberIds.includes(approval.approverMemberId)) {
      continue;
    }
    distinctApprovers.add(approval.approverMemberId);
  }
  if (distinctApprovers.size < 2) {
    return false;
  }
  // Initiator alone cannot satisfy dual approval.
  if (distinctApprovers.size === 1 && distinctApprovers.has(actorMemberId)) {
    return false;
  }
  return true;
}

/**
 * Evaluate whether a shared-space action is permitted under capability policy.
 * Admins cannot access personal data outside their control; sensitive actions
 * require dual approval from active members.
 */
export function evaluateSharedAction(input: EvaluateSharedActionInput): SharedActionEvaluation {
  const { actor, space, action, approvals } = input;

  if (!space.activeMemberIds.includes(actor.memberId)) {
    return 'deny';
  }

  if (action.scope === 'user') {
    const targetMemberId = action.targetMemberId ?? actor.memberId;
    if (!actorControlsPersonalTarget(actor, targetMemberId)) {
      if (isPrivilegedRole(actor.role)) {
        return 'deny';
      }
      if (action.type === 'read_personal_vault' || action.type === 'grant_personal_capability') {
        return 'deny';
      }
    }
    if (
      action.type === 'read_personal_vault'
      || action.type === 'grant_personal_capability'
    ) {
      if (!actorControlsPersonalTarget(actor, targetMemberId)) {
        return 'deny';
      }
    }
  }

  if (action.type === 'publish_personal_to_shared') {
    const publisherId = action.targetMemberId ?? actor.memberId;
    if (publisherId !== actor.memberId) {
      return 'deny';
    }
  }

  if (isSensitiveAction(action.type)) {
    if (hasDualApproval(action.actionId, actor.memberId, approvals, space.activeMemberIds)) {
      return 'allow';
    }
    return 'needs_approval';
  }

  return 'allow';
}

export interface OrgScopedExecutionDestinationInput extends ExecutionDestinationPolicyInput {
  readonly dataScope: CapabilityScope;
  /** Organization-mandated destination preference; ignored for personal scope. */
  readonly orgDestinationPreference?: UserDestinationPreference;
}

/**
 * Applies org-managed execution destinations only to organization-scoped data.
 * Personal user preferences remain authoritative for user-scoped workloads.
 */
export function decideOrgScopedExecutionDestination(
  input: OrgScopedExecutionDestinationInput,
): ExecutionDestinationDecision {
  if (input.dataScope === 'user') {
    return decideExecutionDestination(input);
  }

  if (input.dataScope === 'organization' && input.orgDestinationPreference) {
    return decideExecutionDestination({
      ...input,
      userPreference: input.orgDestinationPreference,
    });
  }

  return decideExecutionDestination(input);
}

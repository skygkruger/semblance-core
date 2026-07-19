import { describe, expect, it } from 'vitest';
import {
  decideOrgScopedExecutionDestination,
  evaluateSharedAction,
  type SharedSpacePolicyActor,
  type SharedSpacePolicySpace,
} from '../src/shared-space/policy.js';

const BASE_SPACE: SharedSpacePolicySpace = {
  sharedSpaceId: 'sspace-11111111-1111-4111-8111-111111111111',
  membershipEpoch: 2,
  activeMemberIds: ['member-owner-001', 'member-admin-001', 'member-alice-001'],
};

function actor(
  memberId: string,
  role: SharedSpacePolicyActor['role'],
): SharedSpacePolicyActor {
  return {
    memberId,
    role,
    personalRootId: `root-personal-${memberId}`,
  };
}

describe('@semblance/kernel shared-space capability policy', () => {
  it('denies admin read of another member personal vault data', () => {
    const result = evaluateSharedAction({
      actor: actor('member-admin-001', 'admin'),
      space: BASE_SPACE,
      action: {
        actionId: 'read-target-personal',
        type: 'read_personal_vault',
        scope: 'user',
        targetMemberId: 'member-alice-001',
      },
      approvals: [],
    });
    expect(result).toBe('deny');
  });

  it('requires dual approval for sensitive shared actions', () => {
    const actionId = 'publish-family-calendar';
    const needsApproval = evaluateSharedAction({
      actor: actor('member-alice-001', 'member'),
      space: BASE_SPACE,
      action: {
        actionId,
        type: 'publish_personal_to_shared',
        scope: 'user',
        targetMemberId: 'member-alice-001',
      },
      approvals: [],
    });
    expect(needsApproval).toBe('needs_approval');

    const oneApproval = evaluateSharedAction({
      actor: actor('member-alice-001', 'member'),
      space: BASE_SPACE,
      action: {
        actionId,
        type: 'publish_personal_to_shared',
        scope: 'user',
        targetMemberId: 'member-alice-001',
      },
      approvals: [
        {
          approverMemberId: 'member-owner-001',
          actionId,
          approvedAt: '2026-07-19T12:00:00.000Z',
        },
      ],
    });
    expect(oneApproval).toBe('needs_approval');

    const dualApproval = evaluateSharedAction({
      actor: actor('member-alice-001', 'member'),
      space: BASE_SPACE,
      action: {
        actionId,
        type: 'publish_personal_to_shared',
        scope: 'user',
        targetMemberId: 'member-alice-001',
      },
      approvals: [
        {
          approverMemberId: 'member-owner-001',
          actionId,
          approvedAt: '2026-07-19T12:00:00.000Z',
        },
        {
          approverMemberId: 'member-admin-001',
          actionId,
          approvedAt: '2026-07-19T12:00:01.000Z',
        },
      ],
    });
    expect(dualApproval).toBe('allow');
  });

  it('applies org destination policy only to organization-scoped data', () => {
    const personalFacts = {
      sensitivity: 20,
      localFeasibility: true,
      destinationTrust: {},
      userPreference: 'local' as const,
      disclosureCeiling: 80,
      attestationAvailable: false,
      localOnlyKillSwitch: false,
      explicitConsent: true,
    };

    const personalDecision = decideOrgScopedExecutionDestination({
      ...personalFacts,
      dataScope: 'user',
      orgDestinationPreference: 'confidential',
    });
    expect(personalDecision.destination).toBe('local');

    const orgDecision = decideOrgScopedExecutionDestination({
      ...personalFacts,
      dataScope: 'organization',
      orgDestinationPreference: 'confidential',
      destinationTrust: { confidential: 'attested' },
      attestationAvailable: true,
    });
    expect(orgDecision.destination).toBe('confidential');
  });
});

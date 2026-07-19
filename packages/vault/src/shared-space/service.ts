import { createHash, randomBytes } from 'node:crypto';
import type { SharedSpaceConsentV1, SharedSpaceRole } from '@semblance/protocol';
import type { SharedSpaceService } from '../../../kernel/src/shared-space/service.js';
import {
  evaluateSharedAction,
  type SharedSpacePolicyActor,
  type SharedSpacePolicySpace,
} from '../../../kernel/src/shared-space/policy.js';
import {
  openSharedSpaceEventLog,
  SharedSpaceEventLog,
  createInMemorySharedSpaceEventLog,
} from './event-log.js';
import {
  approveSharedSpaceAction,
  publishPersonalToSharedSpace,
  type PersonalVaultRecordRef,
  type PublishPersonalToSharedSpaceResult,
} from './publication.js';
import {
  projectSharedEventsForMember,
  type SharedSpaceMemberView,
  type SharedSpaceProjectedEvent,
} from './projection.js';

export interface SharedSpaceVaultServiceOptions {
  readonly dataDir: string;
  readonly sharedSpaceService: SharedSpaceService;
}

export class SharedSpaceVaultService {
  private readonly eventLog: SharedSpaceEventLog;
  private readonly sharedSpaceService: SharedSpaceService;

  private constructor(
    eventLog: SharedSpaceEventLog,
    sharedSpaceService: SharedSpaceService,
  ) {
    this.eventLog = eventLog;
    this.sharedSpaceService = sharedSpaceService;
  }

  static initialize(options: SharedSpaceVaultServiceOptions): SharedSpaceVaultService {
    const rootKey = deriveSharedVaultRootKey(options.dataDir);
    const eventLog = openSharedSpaceEventLog(options.dataDir, rootKey);
    return new SharedSpaceVaultService(eventLog, options.sharedSpaceService);
  }

  static initializeInMemory(sharedSpaceService: SharedSpaceService): SharedSpaceVaultService {
    const eventLog = createInMemorySharedSpaceEventLog(randomBytes(32));
    return new SharedSpaceVaultService(eventLog, sharedSpaceService);
  }

  publish(input: {
    sharedSpaceId: string;
    actorMemberId: string;
    actorPersonalRootId: string;
    actorRole: SharedSpaceRole;
    personalRecord: PersonalVaultRecordRef;
    consent: SharedSpaceConsentV1;
  }): PublishPersonalToSharedSpaceResult {
    const context = this.buildPolicyContext(input.sharedSpaceId, input.actorMemberId, input.actorPersonalRootId, input.actorRole);
    return publishPersonalToSharedSpace({
      sharedSpaceId: input.sharedSpaceId,
      membershipEpoch: context.space.membershipEpoch,
      actor: context.actor,
      space: context.space,
      personalRecord: input.personalRecord,
      consent: input.consent,
      eventLog: this.eventLog,
    });
  }

  approve(input: {
    actionId: string;
    approverMemberId: string;
    actorMemberId: string;
    actorPersonalRootId: string;
    actorRole: SharedSpaceRole;
    consent?: SharedSpaceConsentV1;
    personalRecord?: PersonalVaultRecordRef;
  }): PublishPersonalToSharedSpaceResult {
    const pending = this.eventLog.getPendingApproval(input.actionId);
    if (!pending) {
      throw new Error(`No pending shared-space action: ${input.actionId}`);
    }
    const approver = this.sharedSpaceService.listMembers(pending.sharedSpaceId).find(
      (member) => member.memberId === input.approverMemberId,
    );
    if (!approver || approver.departedAt) {
      throw new Error(`Approver is not an active member: ${input.approverMemberId}`);
    }
    const context = this.buildPolicyContext(
      pending.sharedSpaceId,
      input.actorMemberId,
      input.actorPersonalRootId,
      input.actorRole,
    );
    return approveSharedSpaceAction({
      actionId: input.actionId,
      approverMemberId: input.approverMemberId,
      actor: context.actor,
      space: context.space,
      eventLog: this.eventLog,
      membershipEpoch: context.space.membershipEpoch,
      consent: input.consent,
      personalRecord: input.personalRecord,
    });
  }

  listShared(input: {
    sharedSpaceId: string;
    viewerMemberId: string;
  }): SharedSpaceProjectedEvent[] {
    const members = this.toMemberViews(this.sharedSpaceService.listMembers(input.sharedSpaceId, false));
    return projectSharedEventsForMember({
      sharedSpaceId: input.sharedSpaceId,
      viewerMemberId: input.viewerMemberId,
      members,
      eventLog: this.eventLog,
    });
  }

  listPendingApprovals(sharedSpaceId: string): ReturnType<SharedSpaceEventLog['listPendingApprovals']> {
    return this.eventLog.listPendingApprovals(sharedSpaceId);
  }

  evaluateAdminPersonalRead(input: {
    sharedSpaceId: string;
    actorMemberId: string;
    actorPersonalRootId: string;
    actorRole: SharedSpaceRole;
    targetMemberId: string;
    actionId: string;
  }): ReturnType<typeof evaluateSharedAction> {
    const context = this.buildPolicyContext(
      input.sharedSpaceId,
      input.actorMemberId,
      input.actorPersonalRootId,
      input.actorRole,
    );
    return evaluateSharedAction({
      actor: context.actor,
      space: context.space,
      action: {
        actionId: input.actionId,
        type: 'read_personal_vault',
        scope: 'user',
        targetMemberId: input.targetMemberId,
      },
      approvals: [],
    });
  }

  private buildPolicyContext(
    sharedSpaceId: string,
    actorMemberId: string,
    actorPersonalRootId: string,
    actorRole: SharedSpaceRole,
  ): { actor: SharedSpacePolicyActor; space: SharedSpacePolicySpace } {
    const status = this.sharedSpaceService.getStatus(sharedSpaceId);
    const members = this.sharedSpaceService.listMembers(sharedSpaceId, true);
    return {
      actor: {
        memberId: actorMemberId,
        role: actorRole,
        personalRootId: actorPersonalRootId,
      },
      space: {
        sharedSpaceId,
        membershipEpoch: status.membershipEpoch,
        activeMemberIds: members.map((member) => member.memberId),
      },
    };
  }

  private toMemberViews(
    members: ReturnType<SharedSpaceService['listMembers']>,
  ): SharedSpaceMemberView[] {
    return members.map((member) => ({
      memberId: member.memberId,
      role: member.role,
      departedAt: member.departedAt,
    }));
  }
}

function deriveSharedVaultRootKey(dataDir: string): Buffer {
  return createHash('sha256').update(`shared-space-vault:${dataDir}`, 'utf-8').digest();
}

export {
  approveSharedSpaceAction,
  publishPersonalToSharedSpace,
  projectSharedEventsForMember,
  SharedSpaceEventLog,
  openSharedSpaceEventLog,
  createInMemorySharedSpaceEventLog,
};
export type { PersonalVaultRecordRef, PublishPersonalToSharedSpaceResult, SharedSpaceProjectedEvent };

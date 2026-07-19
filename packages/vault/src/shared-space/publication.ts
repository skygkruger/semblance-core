import { createHash, randomUUID } from 'node:crypto';
import type { SharedSpaceConsentV1 } from '@semblance/protocol';
import {
  evaluateSharedAction,
  type EvaluateSharedActionInput,
  type SharedSpacePolicyActor,
  type SharedSpacePolicySpace,
} from '../../../kernel/src/shared-space/policy.js';
import {
  SharedSpaceEventLog,
  type SharedSpaceStoredEvent,
} from './event-log.js';

export interface PersonalVaultRecordRef {
  readonly recordId: string;
  readonly recordHash: string;
  readonly payloadPlaintext: string;
}

export interface PublishPersonalToSharedSpaceInput {
  readonly sharedSpaceId: string;
  readonly membershipEpoch: number;
  readonly actor: SharedSpacePolicyActor;
  readonly space: SharedSpacePolicySpace;
  readonly personalRecord: PersonalVaultRecordRef;
  readonly consent: SharedSpaceConsentV1;
  readonly eventLog: SharedSpaceEventLog;
  readonly actionId?: string;
  readonly existingApprovals?: EvaluateSharedActionInput['approvals'];
}

export interface PublishPersonalToSharedSpaceResult {
  readonly status: 'published' | 'needs_approval' | 'denied';
  readonly actionId: string;
  readonly event?: SharedSpaceStoredEvent;
  readonly reason?: string;
}

export class SharedSpacePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SharedSpacePublicationError';
  }
}

function hashConsentBinding(consent: SharedSpaceConsentV1, record: PersonalVaultRecordRef): string {
  return createHash('sha256')
    .update(`${consent.consentRecordId}|${consent.memberId}|${record.recordId}|${record.recordHash}`, 'utf-8')
    .digest('hex');
}

/**
 * Explicitly publishes a selected personal vault record into shared space.
 * Never copies ambient personal data — caller must supply the record reference
 * and valid member consent; policy must allow or collect dual approval first.
 */
export function publishPersonalToSharedSpace(
  input: PublishPersonalToSharedSpaceInput,
): PublishPersonalToSharedSpaceResult {
  const actionId = input.actionId ?? `publish-${randomUUID()}`;
  const approvals = input.existingApprovals ?? [];

  if (input.consent.memberId !== input.actor.memberId) {
    return { status: 'denied', actionId, reason: 'consent_member_mismatch' };
  }
  if (input.consent.sharedSpaceId !== input.sharedSpaceId) {
    return { status: 'denied', actionId, reason: 'consent_space_mismatch' };
  }

  const evaluation = evaluateSharedAction({
    actor: input.actor,
    space: input.space,
    action: {
      actionId,
      type: 'publish_personal_to_shared',
      scope: 'user',
      targetMemberId: input.actor.memberId,
    },
    approvals,
  });

  if (evaluation === 'deny') {
    return { status: 'denied', actionId, reason: 'policy_denied' };
  }

  if (evaluation === 'needs_approval') {
    input.eventLog.savePendingApproval({
      actionId,
      sharedSpaceId: input.sharedSpaceId,
      actionType: 'publish_personal_to_shared',
      scope: 'user',
      actorMemberId: input.actor.memberId,
      targetMemberId: input.actor.memberId,
      intentJson: JSON.stringify({
        personalRecordId: input.personalRecord.recordId,
        personalRecordHash: input.personalRecord.recordHash,
        consentBinding: hashConsentBinding(input.consent, input.personalRecord),
      }),
    });
    return { status: 'needs_approval', actionId };
  }

  const event = input.eventLog.append({
    sharedSpaceId: input.sharedSpaceId,
    publisherMemberId: input.actor.memberId,
    membershipEpoch: input.membershipEpoch,
    eventType: 'published_record',
    sourcePersonalRecordId: input.personalRecord.recordId,
    payloadPlaintext: JSON.stringify({
      publicationKind: 'explicit_personal_to_shared',
      personalRecordId: input.personalRecord.recordId,
      personalRecordHash: input.personalRecord.recordHash,
      consentRecordId: input.consent.consentRecordId,
      consentBinding: hashConsentBinding(input.consent, input.personalRecord),
      publishedPayload: input.personalRecord.payloadPlaintext,
    }),
  });

  input.eventLog.deletePendingApproval(actionId);
  return { status: 'published', actionId, event };
}

export interface ApproveSharedSpaceActionInput {
  readonly actionId: string;
  readonly approverMemberId: string;
  readonly actor: SharedSpacePolicyActor;
  readonly space: SharedSpacePolicySpace;
  readonly eventLog: SharedSpaceEventLog;
  readonly membershipEpoch: number;
  readonly consent?: SharedSpaceConsentV1;
  readonly personalRecord?: PersonalVaultRecordRef;
}

export function approveSharedSpaceAction(
  input: ApproveSharedSpaceActionInput,
): PublishPersonalToSharedSpaceResult {
  const pending = input.eventLog.getPendingApproval(input.actionId);
  if (!pending) {
    throw new SharedSpacePublicationError(`No pending shared-space action: ${input.actionId}`);
  }
  if (pending.sharedSpaceId !== input.space.sharedSpaceId) {
    throw new SharedSpacePublicationError('Pending action belongs to a different shared space');
  }

  const approvedAt = new Date().toISOString();
  input.eventLog.recordApproval(input.actionId, input.approverMemberId, approvedAt);
  const approvals = input.eventLog.listApprovals(input.actionId).map((entry) => ({
    approverMemberId: entry.approverMemberId,
    actionId: input.actionId,
    approvedAt: entry.approvedAt,
  }));

  if (pending.actionType !== 'publish_personal_to_shared') {
    const evaluation = evaluateSharedAction({
      actor: input.actor,
      space: input.space,
      action: {
        actionId: input.actionId,
        type: pending.actionType as 'shared_delete' | 'legal_hold' | 'org_destination_override',
        scope: pending.scope as 'user' | 'shared_space' | 'organization',
        targetMemberId: pending.targetMemberId ?? undefined,
      },
      approvals,
    });
    if (evaluation === 'allow') {
      input.eventLog.deletePendingApproval(input.actionId);
      return { status: 'published', actionId: input.actionId, reason: 'sensitive_action_approved' };
    }
    if (evaluation === 'needs_approval') {
      return { status: 'needs_approval', actionId: input.actionId };
    }
    return { status: 'denied', actionId: input.actionId, reason: 'policy_denied' };
  }

  if (!input.consent || !input.personalRecord) {
    throw new SharedSpacePublicationError(
      'Publication approval requires consent and personalRecord for replay',
    );
  }

  return publishPersonalToSharedSpace({
    sharedSpaceId: pending.sharedSpaceId,
    membershipEpoch: input.membershipEpoch,
    actor: input.actor,
    space: input.space,
    personalRecord: input.personalRecord,
    consent: input.consent,
    eventLog: input.eventLog,
    actionId: input.actionId,
    existingApprovals: approvals,
  });
}

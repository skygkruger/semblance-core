import type { SharedSpaceRole } from '@semblance/protocol';
import {
  SharedSpaceEventLog,
  type SharedSpaceStoredEvent,
} from './event-log.js';

export interface SharedSpaceMemberView {
  readonly memberId: string;
  readonly role: SharedSpaceRole;
  readonly departedAt: string | null;
}

export interface SharedSpaceProjectionInput {
  readonly sharedSpaceId: string;
  readonly viewerMemberId: string;
  readonly members: readonly SharedSpaceMemberView[];
  readonly eventLog: SharedSpaceEventLog;
}

export interface SharedSpaceProjectedEvent {
  readonly sequence: number;
  readonly eventId: string;
  readonly publisherMemberId: string;
  readonly membershipEpoch: number;
  readonly eventType: string;
  readonly sourcePersonalRecordId: string | null;
  readonly payloadPlaintext: string;
  readonly occurredAt: string;
}

function isActiveMember(
  members: readonly SharedSpaceMemberView[],
  memberId: string,
): boolean {
  const member = members.find((entry) => entry.memberId === memberId);
  return Boolean(member && member.departedAt === null);
}

/**
 * Returns member-visible projections of shared-space events only.
 * Departed members receive an empty projection; personal vault events are never included.
 */
export function projectSharedEventsForMember(
  input: SharedSpaceProjectionInput,
): SharedSpaceProjectedEvent[] {
  if (!isActiveMember(input.members, input.viewerMemberId)) {
    return [];
  }

  const activeMemberIds = new Set(
    input.members.filter((member) => member.departedAt === null).map((member) => member.memberId),
  );

  return input.eventLog
    .listEvents(input.sharedSpaceId)
    .filter((event) => activeMemberIds.has(event.publisherMemberId))
    .map(toProjectedEvent);
}

export function projectSharedEventsForMemberSinceEpoch(
  input: SharedSpaceProjectionInput & { readonly minimumMembershipEpoch: number },
): SharedSpaceProjectedEvent[] {
  return projectSharedEventsForMember(input).filter(
    (event) => event.membershipEpoch >= input.minimumMembershipEpoch,
  );
}

function toProjectedEvent(event: SharedSpaceStoredEvent): SharedSpaceProjectedEvent {
  return {
    sequence: event.sequence,
    eventId: event.eventId,
    publisherMemberId: event.publisherMemberId,
    membershipEpoch: event.membershipEpoch,
    eventType: event.eventType,
    sourcePersonalRecordId: event.sourcePersonalRecordId,
    payloadPlaintext: event.payloadPlaintext,
    occurredAt: event.occurredAt,
  };
}

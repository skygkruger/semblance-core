import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
  SharedSpaceRole,
} from './common.js';

export const SharedSpaceMembershipOperation = z.enum(['add', 'remove', 'role_change']);
export type SharedSpaceMembershipOperation = z.infer<typeof SharedSpaceMembershipOperation>;

export const SharedSpaceMembershipEventV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    sharedSpaceId: SharedSpaceId,
    membershipEpoch: z.number().int().nonnegative(),
    operation: SharedSpaceMembershipOperation,
    memberId: z.string().min(1),
    personalRootId: z.string().min(1),
    memberPublicKey: z.string().min(1),
    role: SharedSpaceRole,
    consentRecordId: z.string().min(1),
    priorEventHash: z.string().nullable(),
    authorizedByMemberIds: z.array(z.string().min(1)).min(1),
    sharedKeyEnvelope: z.string().min(1),
    occurredAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type SharedSpaceMembershipEventV1 = z.infer<typeof SharedSpaceMembershipEventV1>;

export const SHARED_SPACE_MEMBERSHIP_V1_SCHEMA_ID = 'shared-space-membership-v1';

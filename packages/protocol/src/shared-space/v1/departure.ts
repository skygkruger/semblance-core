import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
} from './common.js';

export const SharedSpaceDepartureV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    sharedSpaceId: SharedSpaceId,
    membershipEpoch: z.number().int().nonnegative(),
    departingMemberId: z.string().min(1),
    personalRootId: z.string().min(1),
    keyRotationId: z.string().min(1),
    authorizedByMemberIds: z.array(z.string().min(1)).min(1),
    occurredAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type SharedSpaceDepartureV1 = z.infer<typeof SharedSpaceDepartureV1>;

export const SHARED_SPACE_DEPARTURE_V1_SCHEMA_ID = 'shared-space-departure-v1';

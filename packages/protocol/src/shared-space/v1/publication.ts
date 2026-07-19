import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
} from './common.js';

export const SharedSpacePublicationIntentV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    intentId: z.string().min(1),
    sharedSpaceId: SharedSpaceId,
    publisherMemberId: z.string().min(1),
    personalRootId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    sourceRecordHash: z.string().min(1),
    targetDomainId: z.string().min(1),
    membershipEpoch: z.number().int().nonnegative(),
    requiresDualApproval: z.boolean(),
    publisherSignature: z.string().min(1),
    createdAt: IsoDateTime,
  })
  .strict();
export type SharedSpacePublicationIntentV1 = z.infer<typeof SharedSpacePublicationIntentV1>;

export const SHARED_SPACE_PUBLICATION_INTENT_V1_SCHEMA_ID = 'shared-space-publication-intent-v1';

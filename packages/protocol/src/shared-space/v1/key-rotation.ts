import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
} from './common.js';

export const SharedSpaceKeyRotationV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    sharedSpaceId: SharedSpaceId,
    membershipEpoch: z.number().int().nonnegative(),
    priorMasterKeyFingerprint: z.string().min(1),
    newMasterKeyFingerprint: z.string().min(1),
    trigger: z.enum(['member_added', 'member_departed', 'recovery', 'scheduled']),
    memberKeyEnvelopes: z.array(
      z
        .object({
          memberId: z.string().min(1),
          encryptedMasterKey: z.string().min(1),
        })
        .strict(),
    ),
    authorizedByMemberIds: z.array(z.string().min(1)).min(1),
    occurredAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type SharedSpaceKeyRotationV1 = z.infer<typeof SharedSpaceKeyRotationV1>;

export const SHARED_SPACE_KEY_ROTATION_V1_SCHEMA_ID = 'shared-space-key-rotation-v1';

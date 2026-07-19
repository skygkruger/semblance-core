import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
} from './common.js';

/** Distinct shared-space root — never interchangeable with a personal Sovereignty Root. */
export const SharedSpaceRootV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    sharedSpaceId: SharedSpaceId,
    sharedSpaceRootPublicKey: z.string().min(1),
    membershipEpoch: z.number().int().nonnegative(),
    recoveryThreshold: z.number().int().positive(),
    recoveryTotal: z.number().int().positive(),
    recoverySecretHash: z.string().min(1),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type SharedSpaceRootV1 = z.infer<typeof SharedSpaceRootV1>;

export const SHARED_SPACE_ROOT_V1_SCHEMA_ID = 'shared-space-root-v1';

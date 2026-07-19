import { z } from 'zod';
import {
  IsoDateTime,
  SchemaVersion,
  SharedSpaceId,
  SharedSpaceProtocolVersionField,
} from './common.js';

export const SharedSpaceRecoveryShareV1 = z
  .object({
    index: z.number().int().positive(),
    shareHex: z.string().min(1),
  })
  .strict();
export type SharedSpaceRecoveryShareV1 = z.infer<typeof SharedSpaceRecoveryShareV1>;

export const SharedSpaceRecoveryV1 = z
  .object({
    schemaVersion: SchemaVersion,
    protocolVersion: SharedSpaceProtocolVersionField,
    sharedSpaceId: SharedSpaceId,
    membershipEpoch: z.number().int().nonnegative(),
    recoveryThreshold: z.number().int().positive(),
    submittedShares: z.array(SharedSpaceRecoveryShareV1).min(1),
    reconstructedSecretHash: z.string().min(1),
    authorizedOwnerMemberIds: z.array(z.string().min(1)).min(1),
    newRootPublicKey: z.string().min(1),
    occurredAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type SharedSpaceRecoveryV1 = z.infer<typeof SharedSpaceRecoveryV1>;

export const SHARED_SPACE_RECOVERY_V1_SCHEMA_ID = 'shared-space-recovery-v1';

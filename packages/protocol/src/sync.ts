import { z } from 'zod';
import { IsoDateTime, SchemaVersion } from './common.js';

export const DeviceMembershipEventV1 = z
  .object({
    schemaVersion: SchemaVersion,
    rootId: z.string().min(1),
    membershipEpoch: z.number().int().nonnegative(),
    operation: z.enum(['add', 'revoke', 'rotate_root', 'change_recovery', 'transfer_owner']),
    deviceId: z.string().min(1),
    devicePublicKey: z.string().min(1),
    priorEventHash: z.string().nullable(),
    authorizedByDeviceIds: z.array(z.string()),
    quorumProof: z.string().min(1),
    domainKeyEnvelopes: z.array(
      z
        .object({
          domainId: z.string().min(1),
          recipientDeviceId: z.string().min(1),
          encryptedKey: z.string().min(1),
        })
        .strict(),
    ),
    occurredAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type DeviceMembershipEventV1 = z.infer<typeof DeviceMembershipEventV1>;

export const PolicyEpochEventV1 = z
  .object({
    schemaVersion: SchemaVersion,
    rootId: z.string().min(1),
    policyEpoch: z.number().int().nonnegative(),
    priorPolicyEventHash: z.string().nullable(),
    policyDocumentHash: z.string().min(1),
    authorizedByDeviceIds: z.array(z.string()),
    quorumProof: z.string().min(1),
    occurredAt: IsoDateTime,
    rootSignature: z.string().min(1),
  })
  .strict();
export type PolicyEpochEventV1 = z.infer<typeof PolicyEpochEventV1>;

export const EncryptedEventEnvelopeV1 = z
  .object({
    schemaVersion: SchemaVersion,
    eventId: z.string().min(1),
    deviceId: z.string().min(1),
    membershipEpoch: z.number().int().nonnegative(),
    domainId: z.string().min(1),
    causalParentIds: z.array(z.string()),
    lamportClock: z.number().int().nonnegative(),
    vectorClock: z.record(z.number().int().nonnegative()),
    ciphertext: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type EncryptedEventEnvelopeV1 = z.infer<typeof EncryptedEventEnvelopeV1>;

export const SyncEnvelopeKind = z.enum([
  'device_membership',
  'policy_epoch',
  'encrypted_event',
]);
export type SyncEnvelopeKind = z.infer<typeof SyncEnvelopeKind>;

export const SyncEnvelopeV1 = z
  .object({
    schemaVersion: SchemaVersion,
    envelopeKind: SyncEnvelopeKind,
    payload: z.union([DeviceMembershipEventV1, PolicyEpochEventV1, EncryptedEventEnvelopeV1]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const kindToSchema: Record<SyncEnvelopeKind, z.ZodType<unknown>> = {
      device_membership: DeviceMembershipEventV1,
      policy_epoch: PolicyEpochEventV1,
      encrypted_event: EncryptedEventEnvelopeV1,
    };
    const expected = kindToSchema[value.envelopeKind];
    const parsed = expected.safeParse(value.payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `payload does not match envelopeKind ${value.envelopeKind}`,
        path: ['payload'],
      });
    }
  });
export type SyncEnvelopeV1 = z.infer<typeof SyncEnvelopeV1>;

export const SYNC_ENVELOPE_V1_SCHEMA_ID = 'sync-envelope-v1';

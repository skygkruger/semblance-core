import { z } from 'zod';
import { IsoDateTime, SchemaVersion } from './common.js';

export const EntitlementTier = z.enum(['founding', 'digital-representative', 'lifetime']);
export type EntitlementTier = z.infer<typeof EntitlementTier>;

export const SignedEntitlementV1 = z
  .object({
    schemaVersion: SchemaVersion,
    entitlementId: z.string().min(1),
    memberId: z.string().min(1),
    tier: EntitlementTier,
    seat: z.number().int().positive().optional(),
    validFrom: IsoDateTime,
    validUntil: IsoDateTime.nullable(),
    offlineGraceDays: z.number().int().nonnegative(),
    revocationEpoch: z.number().int().nonnegative(),
    issuerKeyId: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type SignedEntitlementV1 = z.infer<typeof SignedEntitlementV1>;

export const SIGNED_ENTITLEMENT_V1_SCHEMA_ID = 'signed-entitlement-v1';

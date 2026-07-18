import { z } from 'zod';
import { IsoDateTime, SchemaVersion } from './common.js';

export const ExtensionModelRequirementV1 = z
  .object({
    modelClass: z.string().min(1),
    minimumContext: z.number().int().positive(),
    localRequired: z.boolean(),
  })
  .strict();
export type ExtensionModelRequirementV1 = z.infer<typeof ExtensionModelRequirementV1>;

export const ExtensionRuntimeRequirementsV1 = z
  .object({
    memoryMiB: z.number().int().positive(),
    cpuShares: z.number().positive(),
    platformApi: z.string().min(1),
  })
  .strict();
export type ExtensionRuntimeRequirementsV1 = z.infer<typeof ExtensionRuntimeRequirementsV1>;

export const ExtensionMigrationV1 = z
  .object({
    schemaVersion: z.number().int().nonnegative(),
    uninstall: z.enum(['delete', 'retain_user_data', 'ask']),
  })
  .strict();
export type ExtensionMigrationV1 = z.infer<typeof ExtensionMigrationV1>;

export const ExtensionManifestV1 = z
  .object({
    schemaVersion: SchemaVersion,
    id: z.string().min(1),
    publisher: z.string().min(1),
    version: z.string().min(1),
    platformApi: z.string().min(1),
    contentHash: z.string().min(1),
    entitlement: z.string().nullable(),
    dataCapabilities: z.array(z.string()),
    actionCapabilities: z.array(z.string()),
    networkDestinations: z.array(z.string()),
    tools: z.array(z.string()),
    insightTypes: z.array(z.string()),
    uiSlots: z.array(z.string()),
    schedules: z.array(z.string()),
    modelRequirements: z.array(ExtensionModelRequirementV1),
    runtimeRequirements: ExtensionRuntimeRequirementsV1,
    migration: ExtensionMigrationV1,
    validFrom: IsoDateTime,
    validUntil: IsoDateTime.nullable(),
    signatureKeyId: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type ExtensionManifestV1 = z.infer<typeof ExtensionManifestV1>;

export const EXTENSION_MANIFEST_V1_SCHEMA_ID = 'extension-manifest-v1';

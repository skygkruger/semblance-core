import { z } from 'zod';
import {
  EXTENSION_MANIFEST_V1_SCHEMA_ID,
  EXTENSION_PLATFORM_API_V1,
  isExtensionPlatformApiV1,
} from './api-v1.js';

const IsoDateTime = z.string().datetime();

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

export const ExtensionMigrationPolicyV1 = z
  .object({
    schemaVersion: z.number().int().nonnegative(),
    uninstall: z.enum(['delete', 'retain_user_data', 'ask']),
  })
  .strict();
export type ExtensionMigrationPolicyV1 = z.infer<typeof ExtensionMigrationPolicyV1>;

/** Capability manifest aligned with protocol extension-manifest-v1.schema.json */
export const ExtensionManifestV1 = z
  .object({
    schemaVersion: z.literal(1),
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
    migration: ExtensionMigrationPolicyV1,
    validFrom: IsoDateTime,
    validUntil: IsoDateTime.nullable(),
    signatureKeyId: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type ExtensionManifestV1 = z.infer<typeof ExtensionManifestV1>;

export function parseExtensionManifestV1(input: unknown): ExtensionManifestV1 {
  return ExtensionManifestV1.parse(input);
}

export function safeParseExtensionManifestV1(
  input: unknown,
): z.SafeParseReturnType<unknown, ExtensionManifestV1> {
  return ExtensionManifestV1.safeParse(input);
}

export function assertExtensionManifestPlatformApiV1(manifest: ExtensionManifestV1): void {
  if (!isExtensionPlatformApiV1(manifest.platformApi)) {
    throw new Error(
      `Unsupported platformApi '${manifest.platformApi}'; expected '${EXTENSION_PLATFORM_API_V1}'`,
    );
  }
  if (!isExtensionPlatformApiV1(manifest.runtimeRequirements.platformApi)) {
    throw new Error(
      `Unsupported runtimeRequirements.platformApi '${manifest.runtimeRequirements.platformApi}'; expected '${EXTENSION_PLATFORM_API_V1}'`,
    );
  }
}

export { EXTENSION_MANIFEST_V1_SCHEMA_ID, EXTENSION_PLATFORM_API_V1 };

/**
 * Frozen Extension API v1 identifiers.
 * Third-party extensions MUST declare `platformApi: EXTENSION_PLATFORM_API_V1` in manifests.
 */
export const EXTENSION_API_V1 = 'v1' as const;
export type ExtensionApiV1 = typeof EXTENSION_API_V1;

/** Platform capability surface version (matches protocol extension-manifest-v1.platformApi). */
export const EXTENSION_PLATFORM_API_V1 = '2026-07-18' as const;
export type ExtensionPlatformApiV1 = typeof EXTENSION_PLATFORM_API_V1;

export const EXTENSION_MANIFEST_SCHEMA_V1 = 1 as const;

/** Supported protocol schema id for capability manifests. */
export const EXTENSION_MANIFEST_V1_SCHEMA_ID = 'extension-manifest-v1' as const;

export function isExtensionPlatformApiV1(platformApi: string): platformApi is ExtensionPlatformApiV1 {
  return platformApi === EXTENSION_PLATFORM_API_V1;
}

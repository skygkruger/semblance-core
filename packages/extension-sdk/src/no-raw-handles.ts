/**
 * Guardrail: the public SDK surface must not export raw Vault/Gateway/OS handle types.
 * Mediated *Client interfaces are allowed; *Handle / raw transport types are not.
 */

export const FORBIDDEN_RAW_HANDLE_EXPORTS = [
  'VaultHandle',
  'GatewayHandle',
  'OsHandle',
  'FileSystemHandle',
  'NetworkHandle',
  'RawVault',
  'RawGateway',
  'RawOs',
  'DatabaseHandle',
  'IPCClientHandle',
  'SecretStoreHandle',
  'ProcessHandle',
] as const;

export type ForbiddenRawHandleExport = (typeof FORBIDDEN_RAW_HANDLE_EXPORTS)[number];

const FORBIDDEN_SUBSTRINGS = [
  'RawVault',
  'RawGateway',
  'RawOs',
  'VaultHandle',
  'GatewayHandle',
  'OsHandle',
  'FileSystemHandle',
  'NetworkHandle',
  'DatabaseHandle',
  'SecretStoreHandle',
] as const;

/** Returns forbidden export names found in the provided public export list. */
export function findForbiddenRawHandleExports(exportNames: readonly string[]): string[] {
  const forbidden = new Set<string>(FORBIDDEN_RAW_HANDLE_EXPORTS);
  return exportNames.filter((name) => forbidden.has(name));
}

/** Returns export names that contain forbidden substrings (e.g. accidental RawGatewayClient). */
export function findForbiddenRawHandleSubstrings(exportNames: readonly string[]): string[] {
  return exportNames.filter((name) =>
    FORBIDDEN_SUBSTRINGS.some((fragment) => name.includes(fragment)),
  );
}

export function assertSdkSurfaceNoRawHandles(exportNames: readonly string[]): void {
  const exact = findForbiddenRawHandleExports(exportNames);
  const substring = findForbiddenRawHandleSubstrings(exportNames);
  const violations = [...new Set([...exact, ...substring])];
  if (violations.length > 0) {
    throw new Error(
      `SDK exports forbidden raw handle symbols: ${violations.join(', ')}. Use mediated *Client interfaces only.`,
    );
  }
}

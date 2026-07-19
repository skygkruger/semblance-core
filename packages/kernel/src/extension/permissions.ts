import { safeParseExtensionManifestV1 } from '@semblance/extension-sdk';
import type { SignedExtensionManifest } from '@semblance/extension-sdk';

export interface ExtensionPermissionBundle {
  readonly dataCapabilities: readonly string[];
  readonly actionCapabilities: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly tools: readonly string[];
  readonly insightTypes: readonly string[];
  readonly uiSlots: readonly string[];
  readonly schedules: readonly string[];
  readonly entitlement: string | null;
}

export function emptyPermissionBundle(): ExtensionPermissionBundle {
  return {
    dataCapabilities: [],
    actionCapabilities: [],
    networkDestinations: [],
    tools: [],
    insightTypes: [],
    uiSlots: [],
    schedules: [],
    entitlement: null,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function readStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return isStringArray(value) ? [...value] : [];
}

/** Normalize manifest (v1 protocol or signed Slice 6 manifest) into a permission bundle. */
export function extractRequestedPermissions(manifest: unknown): ExtensionPermissionBundle {
  const v1 = safeParseExtensionManifestV1(manifest);
  if (v1.success) {
    const parsed = v1.data;
    return {
      dataCapabilities: [...parsed.dataCapabilities],
      actionCapabilities: [...parsed.actionCapabilities],
      networkDestinations: [...parsed.networkDestinations],
      tools: [...parsed.tools],
      insightTypes: [...parsed.insightTypes],
      uiSlots: [...parsed.uiSlots],
      schedules: [...parsed.schedules],
      entitlement: parsed.entitlement,
    };
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return emptyPermissionBundle();
  }

  const record = manifest as Record<string, unknown>;
  const permissions = record.permissions;
  if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
    const permRecord = permissions as Record<string, unknown>;
    return {
      dataCapabilities: readStringArray(record, 'dataCapabilities'),
      actionCapabilities: readStringArray(record, 'actionCapabilities'),
      networkDestinations: readStringArray(record, 'networkDestinations'),
      tools: isStringArray(permRecord.tools) ? [...permRecord.tools] : [],
      insightTypes: readStringArray(record, 'insightTypes'),
      uiSlots: isStringArray(permRecord.slots) ? [...permRecord.slots] : [],
      schedules: readStringArray(record, 'schedules'),
      entitlement:
        typeof record.entitlement === 'string'
          ? record.entitlement
          : typeof (record as SignedExtensionManifest).id === 'string'
            ? null
            : null,
    };
  }

  return {
    dataCapabilities: readStringArray(record, 'dataCapabilities'),
    actionCapabilities: readStringArray(record, 'actionCapabilities'),
    networkDestinations: readStringArray(record, 'networkDestinations'),
    tools: readStringArray(record, 'tools'),
    insightTypes: readStringArray(record, 'insightTypes'),
    uiSlots: readStringArray(record, 'uiSlots'),
    schedules: readStringArray(record, 'schedules'),
    entitlement: typeof record.entitlement === 'string' ? record.entitlement : null,
  };
}

function isSubset(granted: readonly string[], requested: readonly string[]): boolean {
  return granted.every((entry) => requested.includes(entry));
}

/** Granted permissions must be a subset of requested permissions for every category. */
export function isGrantedSubsetOfRequested(
  requested: ExtensionPermissionBundle,
  granted: ExtensionPermissionBundle,
): boolean {
  return (
    isSubset(granted.dataCapabilities, requested.dataCapabilities)
    && isSubset(granted.actionCapabilities, requested.actionCapabilities)
    && isSubset(granted.networkDestinations, requested.networkDestinations)
    && isSubset(granted.tools, requested.tools)
    && isSubset(granted.insightTypes, requested.insightTypes)
    && isSubset(granted.uiSlots, requested.uiSlots)
    && isSubset(granted.schedules, requested.schedules)
    && (granted.entitlement === null || granted.entitlement === requested.entitlement)
  );
}

function countRequested(requested: ExtensionPermissionBundle): number {
  return (
    requested.dataCapabilities.length
    + requested.actionCapabilities.length
    + requested.networkDestinations.length
    + requested.tools.length
    + requested.insightTypes.length
    + requested.uiSlots.length
    + requested.schedules.length
    + (requested.entitlement ? 1 : 0)
  );
}

function countGranted(granted: ExtensionPermissionBundle): number {
  return (
    granted.dataCapabilities.length
    + granted.actionCapabilities.length
    + granted.networkDestinations.length
    + granted.tools.length
    + granted.insightTypes.length
    + granted.uiSlots.length
    + granted.schedules.length
    + (granted.entitlement ? 1 : 0)
  );
}

export interface ExplicitGrantValidation {
  readonly ok: boolean;
  readonly error?: string;
}

/** Install requires an explicit permissions payload — no silent full grant. */
export function validateExplicitInstallGrant(
  requested: ExtensionPermissionBundle,
  granted: ExtensionPermissionBundle | null | undefined,
): ExplicitGrantValidation {
  if (!granted) {
    return { ok: false, error: 'Install requires explicit grantedPermissions payload' };
  }

  if (!isGrantedSubsetOfRequested(requested, granted)) {
    return { ok: false, error: 'Granted permissions exceed requested manifest permissions' };
  }

  const requestedCount = countRequested(requested);
  const grantedCount = countGranted(granted);

  if (requestedCount > 0 && grantedCount === 0) {
    return {
      ok: false,
      error: 'Install requires at least one explicitly granted permission from the manifest',
    };
  }

  if (requested.entitlement && granted.entitlement !== requested.entitlement) {
    return {
      ok: false,
      error: `Paid entitlement '${requested.entitlement}' must be explicitly granted`,
    };
  }

  return { ok: true };
}

export function narrowGrantedPermissions(
  current: ExtensionPermissionBundle,
  next: ExtensionPermissionBundle,
  requested: ExtensionPermissionBundle,
): ExplicitGrantValidation {
  if (!isGrantedSubsetOfRequested(requested, next)) {
    return { ok: false, error: 'Cannot grant permissions beyond manifest request' };
  }
  if (!isGrantedSubsetOfRequested(current, next)) {
    return { ok: false, error: 'Permission narrowing must remove capabilities, not add them' };
  }
  return { ok: true };
}

export function permissionBundleFromInput(input: unknown): ExtensionPermissionBundle | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  return {
    dataCapabilities: readStringArray(record, 'dataCapabilities'),
    actionCapabilities: readStringArray(record, 'actionCapabilities'),
    networkDestinations: readStringArray(record, 'networkDestinations'),
    tools: readStringArray(record, 'tools'),
    insightTypes: readStringArray(record, 'insightTypes'),
    uiSlots: readStringArray(record, 'uiSlots'),
    schedules: readStringArray(record, 'schedules'),
    entitlement: typeof record.entitlement === 'string' ? record.entitlement : null,
  };
}

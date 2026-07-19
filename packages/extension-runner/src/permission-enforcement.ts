import type {
  ExtensionRunnerClients,
  ExtensionRunnerClientsV1,
  ExtensionScheduleClient,
  ExtensionUiSlotClient,
  GatewayActionClient,
  GatewayActionRequest,
  VaultClient,
  VaultSearchRequest,
} from '@semblance/extension-sdk';
import {
  createMigrationClient,
  createRecordingGatewayClient,
  createRecordingHealthClient,
  createRecordingReceiptClient,
  createRecordingScheduleClient,
  createRecordingUiSlotClient,
  createRecordingVaultClient,
} from './client-adapters.js';

export interface ExtensionGrantedPermissions {
  readonly dataCapabilities: readonly string[];
  readonly actionCapabilities: readonly string[];
  readonly networkDestinations: readonly string[];
  readonly tools: readonly string[];
  readonly insightTypes: readonly string[];
  readonly uiSlots: readonly string[];
  readonly schedules: readonly string[];
  readonly entitlement: string | null;
}

export class PermissionEnforcementError extends Error {
  readonly kind: string;

  constructor(kind: string, detail: string) {
    super(`Permission enforcement (${kind}): ${detail}`);
    this.name = 'PermissionEnforcementError';
    this.kind = kind;
  }
}

function assertIncluded(kind: string, value: string, granted: readonly string[]): void {
  if (!granted.includes(value)) {
    throw new PermissionEnforcementError(kind, `'${value}' is not in granted permissions`);
  }
}

function filterSources(request: VaultSearchRequest, granted: readonly string[]): VaultSearchRequest {
  if (!request.sources || request.sources.length === 0) {
    return request;
  }
  const allowedSources = request.sources.filter((source) => granted.includes(source));
  if (allowedSources.length === 0) {
    throw new PermissionEnforcementError(
      'data',
      `None of the requested sources are granted: ${request.sources.join(', ')}`,
    );
  }
  return { ...request, sources: allowedSources };
}

export function createEnforcingVaultClient(
  base: VaultClient,
  granted: ExtensionGrantedPermissions,
): VaultClient {
  return {
    searchDocuments: async (request) => {
      if (granted.dataCapabilities.length === 0) {
        throw new PermissionEnforcementError('data', 'No data capabilities granted');
      }
      return base.searchDocuments(filterSources(request, granted.dataCapabilities));
    },
    getDocumentSummary: async (documentId) => {
      if (granted.dataCapabilities.length === 0) {
        throw new PermissionEnforcementError('data', 'No data capabilities granted');
      }
      return base.getDocumentSummary(documentId);
    },
  };
}

export function createEnforcingGatewayClient(
  base: GatewayActionClient,
  granted: ExtensionGrantedPermissions,
): GatewayActionClient {
  return {
    executeAction: async (request: GatewayActionRequest) => {
      assertIncluded('action', request.action, granted.actionCapabilities);
      const destination =
        request.payload
        && typeof request.payload === 'object'
        && !Array.isArray(request.payload)
        && typeof (request.payload as Record<string, unknown>).destination === 'string'
          ? String((request.payload as Record<string, unknown>).destination)
          : null;
      if (destination) {
        assertIncluded('network', destination, granted.networkDestinations);
      }
      return base.executeAction(request);
    },
  };
}

export function createEnforcingUiSlotClient(
  base: ExtensionUiSlotClient,
  declared: readonly string[],
  granted: readonly string[],
): ExtensionUiSlotClient {
  const allowed = declared.filter((slotId) => granted.includes(slotId));
  const enforcing = createRecordingUiSlotClient(allowed);
  return {
    register(registration) {
      assertIncluded('ui-slot', registration.slotId, granted);
      return base.register(registration);
    },
    unregister(slotId) {
      return base.unregister(slotId);
    },
    listDeclaredSlots: () => allowed,
    listRegisteredSlots: () => enforcing.listRegisteredSlots(),
  };
}

export function createEnforcingScheduleClient(
  base: ExtensionScheduleClient,
  declared: readonly string[],
  granted: readonly string[],
): ExtensionScheduleClient {
  const allowed = declared.filter((scheduleId) => granted.includes(scheduleId));
  const enforcing = createRecordingScheduleClient(allowed);
  return {
    register: async (registration) => {
      assertIncluded('schedule', registration.spec.scheduleId, granted);
      await base.register(registration);
      return enforcing.register(registration);
    },
    cancel: async (scheduleId) => {
      await base.cancel(scheduleId);
      await enforcing.cancel(scheduleId);
    },
    listActive: async () => {
      const active = await base.listActive();
      return active.filter((scheduleId) => granted.includes(scheduleId));
    },
  };
}

export interface CreatePermissionEnforcedClientsOptions {
  readonly base: ExtensionRunnerClients;
  readonly granted: ExtensionGrantedPermissions;
  readonly extensionId: string;
  readonly dataDir: string;
  readonly declared?: {
    readonly uiSlots: readonly string[];
    readonly schedules: readonly string[];
    readonly migration: { schemaVersion: number; uninstall: 'delete' | 'retain_user_data' | 'ask' };
  };
}

export function createPermissionEnforcedClientsV1(
  options: CreatePermissionEnforcedClientsOptions,
): ExtensionRunnerClientsV1 {
  const { base, granted, extensionId, dataDir, declared } = options;
  const uiSlots = declared?.uiSlots ?? [];
  const schedules = declared?.schedules ?? [];
  const migration = declared?.migration ?? { schemaVersion: 0, uninstall: 'ask' as const };

  return {
    vault: createEnforcingVaultClient(base.vault, granted),
    gateway: createEnforcingGatewayClient(base.gateway, granted),
    kernel: base.kernel,
    uiSlots: createEnforcingUiSlotClient(
      createRecordingUiSlotClient(uiSlots),
      uiSlots,
      granted.uiSlots,
    ),
    schedules: createEnforcingScheduleClient(
      createRecordingScheduleClient(schedules),
      schedules,
      granted.schedules,
    ),
    health: createRecordingHealthClient(extensionId),
    migration: createMigrationClient(extensionId, dataDir, migration),
    receipts: createRecordingReceiptClient(),
  };
}

/** Test helper — builds minimal clients with enforcement only. */
export function createTestEnforcedClients(
  granted: ExtensionGrantedPermissions,
): ExtensionRunnerClientsV1 {
  return createPermissionEnforcedClientsV1({
    base: {
      vault: createRecordingVaultClient(),
      gateway: createRecordingGatewayClient(),
      kernel: {
        getSnapshot: () => null,
        isPremium: () => false,
      },
    },
    granted,
    extensionId: 'test-extension',
    dataDir: '/tmp/test-extension',
    declared: {
      uiSlots: ['settings.capabilities'],
      schedules: ['daily_digest'],
      migration: { schemaVersion: 0, uninstall: 'ask' },
    },
  });
}

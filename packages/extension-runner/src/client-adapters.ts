import type {
  ExtensionActionReceiptV1,
  ExtensionHealthClient,
  ExtensionHealthPingResultV1,
  ExtensionHealthReportV1,
  ExtensionMigrationClient,
  ExtensionMigrationPolicyV1,
  ExtensionMigrationStateV1,
  ExtensionReceiptClient,
  ExtensionRunnerClients,
  ExtensionRunnerClientsV1,
  ExtensionScheduleClient,
  ExtensionScheduleRegistrationV1,
  ExtensionUiSlotClient,
  ExtensionUiSlotRegistrationV1,
  GatewayActionClient,
  GatewayActionRequest,
  GatewayActionResult,
  KernelEntitlementClient,
  KernelEntitlementSnapshot,
  VaultClient,
  VaultSearchRequest,
} from '@semblance/extension-sdk';

export interface ExtensionInitContextLike {
  db: unknown;
  llm?: unknown;
  model?: string;
  ipcClient?: unknown;
  autonomyManager?: unknown;
  premiumGate?: unknown;
  styleProfileStore?: unknown;
  semanticSearch?: unknown;
  recurringDetector?: unknown;
  knowledgeGraph?: unknown;
  dataDir?: string;
  vaultClient?: VaultClient;
  gatewayClient?: GatewayActionClient;
  kernelClient?: KernelEntitlementClient;
}

export interface BuildExtensionInitContextOptions {
  clients: ExtensionRunnerClients;
  dataDir?: string;
  model?: string;
  /** Legacy handles retained for in-process dev fallback only. */
  legacy?: Partial<ExtensionInitContextLike>;
}

export interface BuildExtensionInitContextV1Options {
  extensionId: string;
  clients: ExtensionRunnerClientsV1;
  dataDir: string;
  model?: string;
  declaredManifest?: {
    uiSlots: readonly string[];
    schedules: readonly string[];
    migration: ExtensionMigrationPolicyV1;
  };
}

export function buildExtensionInitContext(
  options: BuildExtensionInitContextOptions,
): ExtensionInitContextLike {
  const { clients, legacy = {} } = options;

  const premiumGate = {
    isPremium: () => clients.kernel.isPremium(),
    getLicenseTier: () => clients.kernel.getSnapshot()?.tier ?? 'free',
  };

  const ipcClient = {
    sendAction: async (action: string, payload: unknown): Promise<GatewayActionResult> =>
      clients.gateway.executeAction({ action, payload }),
  };

  const semanticSearch = {
    search: async (query: string, limit = 10) =>
      clients.vault.searchDocuments({ query, limit }),
  };

  return {
    db: legacy.db ?? createDeniedDbProxy(),
    llm: legacy.llm,
    model: options.model ?? legacy.model,
    ipcClient: legacy.ipcClient ?? ipcClient,
    autonomyManager: legacy.autonomyManager,
    premiumGate: legacy.premiumGate ?? premiumGate,
    styleProfileStore: legacy.styleProfileStore,
    semanticSearch: legacy.semanticSearch ?? semanticSearch,
    recurringDetector: legacy.recurringDetector,
    knowledgeGraph: legacy.knowledgeGraph ?? createVaultKnowledgeGraphAdapter(clients.vault),
    dataDir: options.dataDir ?? legacy.dataDir,
    vaultClient: clients.vault,
    gatewayClient: clients.gateway,
    kernelClient: clients.kernel,
  };
}

export function buildExtensionInitContextV1(options: BuildExtensionInitContextV1Options) {
  const declaredUiSlots = options.declaredManifest?.uiSlots ?? [];
  const declaredSchedules = options.declaredManifest?.schedules ?? [];
  const migrationPolicy = options.declaredManifest?.migration ?? {
    schemaVersion: 0,
    uninstall: 'ask' as const,
  };

  const clients: ExtensionRunnerClientsV1 = {
    vault: options.clients.vault,
    gateway: options.clients.gateway,
    kernel: options.clients.kernel,
    uiSlots:
      options.declaredManifest !== undefined
        ? createRecordingUiSlotClient(declaredUiSlots)
        : (options.clients.uiSlots ?? createRecordingUiSlotClient()),
    schedules:
      options.declaredManifest !== undefined
        ? createRecordingScheduleClient(declaredSchedules)
        : (options.clients.schedules ?? createRecordingScheduleClient()),
    health: options.clients.health ?? createRecordingHealthClient(options.extensionId),
    migration:
      options.declaredManifest !== undefined
        ? createMigrationClient(options.extensionId, options.dataDir, migrationPolicy)
        : (options.clients.migration ??
          createMigrationClient(options.extensionId, options.dataDir, migrationPolicy)),
    receipts: options.clients.receipts ?? createRecordingReceiptClient(),
  };

  return {
    extensionId: options.extensionId,
    dataDir: options.dataDir,
    model: options.model,
    clients,
    uiSlots: clients.uiSlots,
    schedules: clients.schedules,
    health: clients.health,
    migration: clients.migration,
    receipts: clients.receipts,
  };
}

function createDeniedDbProxy(): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(
          `Direct database access denied in signed extension context (attempted ${String(prop)})`,
        );
      },
    },
  );
}

function createVaultKnowledgeGraphAdapter(vault: VaultClient): unknown {
  return {
    semanticSearch: {
      search: (query: string, limit = 10) => vault.searchDocuments({ query, limit }),
    },
    getDocumentSummary: (documentId: string) => vault.getDocumentSummary(documentId),
  };
}

export function createStubEntitlementClient(
  snapshot: KernelEntitlementSnapshot | null,
): KernelEntitlementClient {
  return {
    getSnapshot: () => snapshot,
    isPremium: () => snapshot?.active === true && snapshot.tier !== 'free',
  };
}

export function createRecordingGatewayClient(
  handler?: (request: GatewayActionRequest) => GatewayActionResult | Promise<GatewayActionResult>,
): GatewayActionClient & { requests: GatewayActionRequest[] } {
  const requests: GatewayActionRequest[] = [];
  return {
    requests,
    executeAction: async (request) => {
      requests.push(request);
      if (handler) {
        return handler(request);
      }
      return { status: 'success', data: { ok: true }, auditRef: 'test-audit' };
    },
  };
}

export function createRecordingVaultClient(): VaultClient & { searches: string[] } {
  const searches: string[] = [];
  return {
    searches,
    searchDocuments: async (request: VaultSearchRequest) => {
      searches.push(request.query);
      return [];
    },
    getDocumentSummary: async () => null,
  };
}

export function createRecordingUiSlotClient(
  declaredSlots: readonly string[] = [],
): ExtensionUiSlotClient & { registrations: ExtensionUiSlotRegistrationV1[] } {
  const registrations: ExtensionUiSlotRegistrationV1[] = [];
  const registered = new Set<string>();
  return {
    registrations,
    register(registration) {
      if (!declaredSlots.includes(registration.slotId)) {
        throw new Error(`UI slot '${registration.slotId}' is not declared in manifest.uiSlots`);
      }
      registrations.push(registration);
      registered.add(registration.slotId);
    },
    unregister(slotId) {
      registered.delete(slotId);
    },
    listDeclaredSlots: () => declaredSlots,
    listRegisteredSlots: () => [...registered],
  };
}

export function createRecordingScheduleClient(
  declaredSchedules: readonly string[] = [],
): ExtensionScheduleClient & { registrations: ExtensionScheduleRegistrationV1[] } {
  const registrations: ExtensionScheduleRegistrationV1[] = [];
  const active = new Set<string>();
  return {
    registrations,
    register: async (registration) => {
      if (!declaredSchedules.includes(registration.spec.scheduleId)) {
        throw new Error(
          `Schedule '${registration.spec.scheduleId}' is not declared in manifest.schedules`,
        );
      }
      registrations.push(registration);
      active.add(registration.spec.scheduleId);
      return registration.spec.scheduleId;
    },
    cancel: async (scheduleId) => {
      active.delete(scheduleId);
    },
    listActive: async () => [...active],
  };
}

export function createRecordingHealthClient(
  extensionId: string,
): ExtensionHealthClient & { reports: ExtensionHealthReportV1[]; pingCount: number } {
  const reports: ExtensionHealthReportV1[] = [];
  let pingCount = 0;
  return {
    reports,
    pingCount: 0,
    report: async (report) => {
      reports.push(report);
    },
    ping: async (): Promise<ExtensionHealthPingResultV1> => {
      pingCount += 1;
      return { ok: true, latencyMs: 0 };
    },
  };
}

export function createMigrationClient(
  extensionId: string,
  dataDir: string,
  policy: ExtensionMigrationPolicyV1,
): ExtensionMigrationClient {
  let schemaVersion = policy.schemaVersion;
  return {
    getState: (): ExtensionMigrationStateV1 => ({
      schemaVersion,
      extensionId,
      dataDir,
    }),
    getDeclaredPolicy: () => policy,
    runUpgrade: async (fromVersion, toVersion) => {
      if (fromVersion !== schemaVersion) {
        throw new Error(
          `Migration from ${fromVersion} rejected; current schemaVersion is ${schemaVersion}`,
        );
      }
      schemaVersion = toVersion;
    },
    prepareUninstall: async () => ({ policy: policy.uninstall }),
  };
}

export function createRecordingReceiptClient(): ExtensionReceiptClient & {
  receipts: ExtensionActionReceiptV1[];
} {
  const receipts: ExtensionActionReceiptV1[] = [];
  return {
    receipts,
    listRecent: async (limit = 20) => receipts.slice(0, limit),
    get: async (receiptId) => receipts.find((receipt) => receipt.receiptId === receiptId) ?? null,
  };
}

export function buildExtensionRunnerClientsV1(
  base: ExtensionRunnerClients,
  overrides?: Partial<Omit<ExtensionRunnerClientsV1, keyof ExtensionRunnerClients>>,
): ExtensionRunnerClientsV1 {
  return {
    ...base,
    uiSlots: overrides?.uiSlots ?? createRecordingUiSlotClient(),
    schedules: overrides?.schedules ?? createRecordingScheduleClient(),
    health: overrides?.health ?? createRecordingHealthClient('extension'),
    migration:
      overrides?.migration ??
      createMigrationClient('extension', '', { schemaVersion: 0, uninstall: 'ask' }),
    receipts: overrides?.receipts ?? createRecordingReceiptClient(),
  };
}

import type {
  ExtensionRunnerClients,
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

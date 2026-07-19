import type { IPCClient } from '../agent/ipc-client.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type {
  ExtensionRunnerClients,
  GatewayActionClient,
  GatewayActionRequest,
  GatewayActionResult,
  KernelEntitlementClient,
  VaultClient,
  VaultSearchRequest,
} from '@semblance/extension-sdk';

export interface BuildRunnerClientsOptions {
  ipc: IPCClient;
  knowledge: KnowledgeGraph;
  premiumGate: PremiumGate;
}

export function buildExtensionRunnerClients(
  options: BuildRunnerClientsOptions,
): ExtensionRunnerClients {
  return {
    vault: createVaultClient(options.knowledge),
    gateway: createGatewayClient(options.ipc),
    kernel: createKernelEntitlementClient(options.premiumGate),
  };
}

function createVaultClient(knowledge: KnowledgeGraph): VaultClient {
  return {
    async searchDocuments(request: VaultSearchRequest) {
      const results = await knowledge.semanticSearch.search(request.query, {
        limit: request.limit ?? 10,
      });
      return results.map((result) => ({
        documentId: result.document.id,
        title: result.document.title ?? result.document.id,
        snippet: result.chunk.content ?? '',
        score: result.score,
      }));
    },
    async getDocumentSummary(documentId: string) {
      const document = await knowledge.getDocument(documentId);
      if (!document) return null;
      return {
        id: document.id,
        title: document.title ?? document.id,
        source: document.source,
        updatedAt: document.updatedAt ?? document.createdAt ?? new Date().toISOString(),
      };
    },
  };
}

function createGatewayClient(ipc: IPCClient): GatewayActionClient {
  return {
    async executeAction(request: GatewayActionRequest): Promise<GatewayActionResult> {
      const response = await ipc.sendAction(
        request.action as Parameters<IPCClient['sendAction']>[0],
        (request.payload ?? {}) as Record<string, unknown>,
      );
      return {
        status: response.status,
        data: response.data,
        error: response.error,
        auditRef: response.auditRef,
      };
    },
  };
}

function createKernelEntitlementClient(premiumGate: PremiumGate): KernelEntitlementClient {
  return {
    getSnapshot: () => ({
      active: premiumGate.isPremium(),
      tier: premiumGate.getLicenseTier(),
      validUntil: null,
      seat: premiumGate.getFoundingSeat(),
    }),
    isPremium: () => premiumGate.isPremium(),
  };
}

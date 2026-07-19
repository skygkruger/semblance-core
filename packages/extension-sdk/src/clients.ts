/**
 * Capability-scoped extension clients.
 * Extensions receive these typed interfaces — never raw db/fs/network handles.
 */

export interface VaultDocumentSummary {
  id: string;
  title: string;
  source: string;
  updatedAt: string;
}

export interface VaultSearchRequest {
  query: string;
  limit?: number;
  sources?: string[];
}

export interface VaultSearchResult {
  documentId: string;
  title: string;
  snippet: string;
  score: number;
}

/** Read-only Vault access scoped to declared permissions. */
export interface VaultClient {
  searchDocuments(request: VaultSearchRequest): Promise<VaultSearchResult[]>;
  getDocumentSummary(documentId: string): Promise<VaultDocumentSummary | null>;
}

export interface GatewayActionRequest {
  action: string;
  payload: unknown;
  requestId?: string;
  estimatedTimeSavedSeconds?: number;
}

export interface GatewayActionResult {
  status: 'success' | 'error' | 'requires_approval' | 'rate_limited';
  data?: unknown;
  error?: { code: string; message: string };
  auditRef?: string;
}

/** Typed Gateway action transport — no raw HTTP. */
export interface GatewayActionClient {
  executeAction(request: GatewayActionRequest): Promise<GatewayActionResult>;
}

export interface KernelEntitlementSnapshot {
  active: boolean;
  tier: string;
  validUntil: string | null;
  seat: number | null;
}

/** Kernel-backed entitlement view for extension gating. */
export interface KernelEntitlementClient {
  getSnapshot(): KernelEntitlementSnapshot | null;
  isPremium(): boolean;
}

export interface ExtensionRunnerClients {
  vault: VaultClient;
  gateway: GatewayActionClient;
  kernel: KernelEntitlementClient;
}

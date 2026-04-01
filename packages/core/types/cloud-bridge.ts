// Cloud Bridge Types — Interfaces for opt-in cloud AI routing.
//
// These types define the data shapes for Cloud Bridge configuration,
// provider management, request/response routing, and audit entries.
//
// CRITICAL: This file is in packages/core/types/. ZERO network imports.
// All actual API calls happen in packages/gateway/cloud-bridge/.

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface CloudBridgeProvider {
  id: string;                          // 'anthropic', 'openai', 'google', 'custom'
  name: string;                        // Display name: 'Anthropic API', 'OpenAI API'
  connectionType: 'api_key';           // 'oauth' reserved for future — not implemented in Phase 3
  status: 'connected' | 'disconnected' | 'error' | 'rate_limited';
  models: CloudBridgeModel[];
  usageThisMonth: {
    requests: number;
    tokensIn: number;
    tokensOut: number;
    estimatedCost: number | null;      // null if cost tracking not available
  };
  credentials: {
    storageKey: string;                // OS keychain reference — NEVER the actual credential
    expiresAt: number | null;          // null for API keys (no expiry)
  };
  /** Base URL for OpenAI-compatible endpoints. Null for known providers. */
  baseUrl: string | null;
  /** When this provider was last validated (ISO 8601). */
  lastValidatedAt: string | null;
  /** Error message if status is 'error'. */
  errorMessage: string | null;
}

// ─── Model ────────────────────────────────────────────────────────────────────

export interface CloudBridgeModel {
  id: string;                          // 'claude-sonnet-4', 'gpt-4o', etc.
  provider: string;                    // parent provider id
  displayName: string;
  contextWindow: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  costPerInputToken: number | null;    // null if unknown
  costPerOutputToken: number | null;
}

// ─── Request / Response ───────────────────────────────────────────────────────

export interface CloudBridgeRequest {
  id: string;
  subagentId: string;
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  maxTokens: number;
  temperature: number;
  metadata: {
    taskType: string;
    domain: string;
    contentCategories: string[];       // detected by content classifier
    estimatedCost: number | null;
  };
}

export interface CloudBridgeResponse {
  requestId: string;
  provider: string;
  model: string;
  message: { role: string; content: string };
  tokensUsed: { prompt: number; completion: number; total: number };
  durationMs: number;
  /** Whether the response was from a cache hit (some providers support this). */
  cached: boolean;
}

// ─── Routing Policy ───────────────────────────────────────────────────────────

export type CloudBridgeRoutingMode = 'off' | 'manual' | 'smart' | 'always';

export interface CloudBridgeDomainRule {
  routing: 'local' | 'cloud' | 'never_cloud';
  preferredProvider?: string;
  preferredModel?: string;
}

export interface CloudBridgeRoutingPolicy {
  mode: CloudBridgeRoutingMode;
  domainRules: Record<string, CloudBridgeDomainRule>;
  excludedCategories: string[];        // 'financial', 'health', 'legal', 'personal_id'
  spendingCap: {
    enabled: boolean;
    monthlyLimit: number;              // in cents (USD)
    currentSpend: number;              // in cents (USD)
  };
  previewBeforeSend: boolean;
}

export const DEFAULT_ROUTING_POLICY: CloudBridgeRoutingPolicy = {
  mode: 'off',
  domainRules: {},
  excludedCategories: ['financial', 'health'],
  spendingCap: {
    enabled: false,
    monthlyLimit: 2500, // $25.00
    currentSpend: 0,
  },
  previewBeforeSend: false,
};

// ─── Data Categories (for content classifier) ────────────────────────────────

export type DataCategory =
  | 'financial'
  | 'health'
  | 'legal'
  | 'personal_id'
  | 'contact_info'
  | 'calendar'
  | 'general';

// ─── Audit Entry ──────────────────────────────────────────────────────────────

export interface CloudBridgeAuditEntry {
  type: 'cloud_bridge_request';
  timestamp: number;
  provider: string;
  model: string;
  subagentId: string;
  taskType: string;
  domain: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number | null;
  contentCategoriesDetected: string[];
  promptContentHash: string;           // SHA-256 of prompt — verifiable without storing content
  responseContentHash: string;
  routingMode: string;                 // which mode triggered this: manual, smart, always
  latencyMs: number;
}

// ─── Known Provider Definitions ───────────────────────────────────────────────

export interface KnownProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  models: CloudBridgeModel[];
  /** Header name for the API key (e.g., 'x-api-key', 'Authorization'). */
  authHeader: string;
  /** How to format the API key in the header (e.g., 'Bearer {key}', '{key}'). */
  authFormat: string;
  /** Endpoint for chat completions. */
  chatEndpoint: string;
  /** Endpoint for listing models (used for validation). Null if not available. */
  modelsEndpoint: string | null;
}

export const KNOWN_PROVIDERS: KnownProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    authFormat: '{key}',
    chatEndpoint: '/v1/messages',
    modelsEndpoint: '/v1/models',
    models: [
      { id: 'claude-sonnet-4-20250514', provider: 'anthropic', displayName: 'Claude Sonnet 4', contextWindow: 200000, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.000003, costPerOutputToken: 0.000015 },
      { id: 'claude-opus-4-20250514', provider: 'anthropic', displayName: 'Claude Opus 4', contextWindow: 200000, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.000015, costPerOutputToken: 0.000075 },
      { id: 'claude-haiku-4-20250514', provider: 'anthropic', displayName: 'Claude Haiku 4', contextWindow: 200000, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.0000008, costPerOutputToken: 0.000004 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
    authFormat: 'Bearer {key}',
    chatEndpoint: '/v1/chat/completions',
    modelsEndpoint: '/v1/models',
    models: [
      { id: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o', contextWindow: 128000, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.0000025, costPerOutputToken: 0.00001 },
      { id: 'gpt-4o-mini', provider: 'openai', displayName: 'GPT-4o Mini', contextWindow: 128000, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.00000015, costPerOutputToken: 0.0000006 },
      { id: 'o3-mini', provider: 'openai', displayName: 'o3-mini', contextWindow: 200000, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.0000011, costPerOutputToken: 0.0000044 },
    ],
  },
  {
    id: 'google',
    name: 'Google AI (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: 'x-goog-api-key',
    authFormat: '{key}',
    chatEndpoint: '/v1beta/models/{model}:generateContent',
    modelsEndpoint: '/v1beta/models',
    models: [
      { id: 'gemini-2.0-flash', provider: 'google', displayName: 'Gemini 2.0 Flash', contextWindow: 1048576, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.0000001, costPerOutputToken: 0.0000004 },
      { id: 'gemini-2.5-pro-preview-06-05', provider: 'google', displayName: 'Gemini 2.5 Pro', contextWindow: 1048576, supportsStreaming: true, supportsTools: true, costPerInputToken: 0.00000125, costPerOutputToken: 0.00001 },
    ],
  },
];

/** Get a known provider config by ID. */
export function getKnownProvider(id: string): KnownProviderConfig | null {
  return KNOWN_PROVIDERS.find(p => p.id === id) ?? null;
}

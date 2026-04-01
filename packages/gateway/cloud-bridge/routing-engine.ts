// Cloud Bridge Routing Engine — Decides whether to route inference requests
// to local models or through Cloud Bridge to a cloud provider.
//
// The routing decision happens entirely in the Gateway. The AI Core emits
// a generic inference request; the Gateway decides the routing; the response
// returns the same way. The AI Core NEVER knows if a response came from cloud.
//
// Routing modes:
//   - off:     All inference local. Default state.
//   - manual:  User explicitly requests cloud routing per-task.
//   - smart:   Auto-route based on complexity, domain rules, and exclusions.
//   - always:  All primary reasoning through cloud. Local handles only classify/embed.
//
// This file is in packages/gateway/. Network access is permitted here.

import { nanoid } from 'nanoid';
import { sha256 } from '@semblance/core';
import type {
  CloudBridgeRoutingPolicy,
  CloudBridgeRequest,
  CloudBridgeResponse,
  CloudBridgeAuditEntry,
  DataCategory,
} from '@semblance/core';
import { DEFAULT_ROUTING_POLICY } from '@semblance/core';
import { ProviderRegistry } from './provider-registry.js';
import { CloudBridgeAdapter } from './cloud-bridge-adapter.js';
import { classifyContent, checkExclusions } from './content-classifier.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RoutingDecision {
  route: 'local' | 'cloud_bridge';
  reason: string;
  provider?: string;
  model?: string;
  blockedCategories?: string[];
}

export interface RoutingEngineConfig {
  providerRegistry: ProviderRegistry;
  adapter: CloudBridgeAdapter;
  /** Callback to log audit entries to the Merkle chain. */
  logAuditEntry: (entry: CloudBridgeAuditEntry) => void;
  /** Callback to notify the user of Cloud Bridge events. */
  onNotify?: (message: string, level: 'info' | 'warning') => void;
}

// ─── Routing Engine ───────────────────────────────────────────────────────────

export class CloudBridgeRoutingEngine {
  private policy: CloudBridgeRoutingPolicy;
  private registry: ProviderRegistry;
  private adapter: CloudBridgeAdapter;
  private logAuditEntry: (entry: CloudBridgeAuditEntry) => void;
  private onNotify: (message: string, level: 'info' | 'warning') => void;

  constructor(config: RoutingEngineConfig) {
    this.policy = { ...DEFAULT_ROUTING_POLICY };
    this.registry = config.providerRegistry;
    this.adapter = config.adapter;
    this.logAuditEntry = config.logAuditEntry;
    this.onNotify = config.onNotify ?? (() => {});
  }

  /** Update the routing policy. */
  setPolicy(policy: CloudBridgeRoutingPolicy): void {
    this.policy = { ...policy };
  }

  /** Get the current routing policy. */
  getPolicy(): CloudBridgeRoutingPolicy {
    return { ...this.policy };
  }

  /**
   * Decide whether a request should route to local or Cloud Bridge.
   *
   * This is the core routing decision. It checks:
   *   1. Is Cloud Bridge enabled (mode !== 'off')?
   *   2. Is any provider connected?
   *   3. Does the domain rule allow cloud for this domain?
   *   4. Does the content contain excluded categories?
   *   5. Is the spending cap exceeded?
   */
  decide(
    domain: string,
    promptText: string,
    options?: { forceCloud?: boolean; taskType?: string },
  ): RoutingDecision {
    // Mode: off → always local
    if (this.policy.mode === 'off') {
      return { route: 'local', reason: 'Cloud Bridge is disabled' };
    }

    // No connected provider → local
    if (!this.registry.hasConnectedProvider()) {
      return { route: 'local', reason: 'No connected Cloud Bridge provider' };
    }

    // Domain rule: never_cloud → local
    const domainRule = this.policy.domainRules[domain];
    if (domainRule?.routing === 'never_cloud') {
      return { route: 'local', reason: `Domain '${domain}' is set to never use cloud` };
    }

    // Content exclusion check
    const violations = checkExclusions(promptText, this.policy.excludedCategories);
    if (violations.length > 0) {
      return {
        route: 'local',
        reason: `Content contains excluded categories: ${violations.join(', ')}`,
        blockedCategories: violations,
      };
    }

    // Spending cap check
    if (this.policy.spendingCap.enabled) {
      if (this.policy.spendingCap.currentSpend >= this.policy.spendingCap.monthlyLimit) {
        this.onNotify('Cloud Bridge spending cap reached. Falling back to local inference.', 'warning');
        return { route: 'local', reason: 'Monthly spending cap exceeded' };
      }
    }

    // Mode-specific routing
    switch (this.policy.mode) {
      case 'manual':
        // Only route to cloud if explicitly requested
        if (!options?.forceCloud) {
          return { route: 'local', reason: 'Manual mode — cloud not explicitly requested' };
        }
        break;

      case 'smart':
        // Route to cloud if domain rule says 'cloud', or if no rule exists
        // and the task type suggests benefit from frontier model
        if (domainRule?.routing === 'local') {
          return { route: 'local', reason: `Domain '${domain}' prefers local routing` };
        }
        break;

      case 'always':
        // Always route to cloud (except for excluded categories, already checked above)
        break;
    }

    // Select provider and model
    const preferredProvider = domainRule?.preferredProvider;
    const preferredModel = domainRule?.preferredModel;

    let selectedProvider = preferredProvider
      ? this.registry.getProvider(preferredProvider)
      : null;

    // Fall back to first connected provider
    if (!selectedProvider || selectedProvider.status !== 'connected') {
      const connected = this.registry.getConnectedProviders();
      selectedProvider = connected[0] ?? null;
    }

    if (!selectedProvider) {
      return { route: 'local', reason: 'No healthy Cloud Bridge provider available' };
    }

    const selectedModel = preferredModel ??
      this.registry.getDefaultModel(selectedProvider.id)?.id ??
      selectedProvider.models[0]?.id;

    if (!selectedModel) {
      return { route: 'local', reason: `No model available for provider ${selectedProvider.id}` };
    }

    return {
      route: 'cloud_bridge',
      reason: `Routing via ${selectedProvider.name} (${this.policy.mode} mode)`,
      provider: selectedProvider.id,
      model: selectedModel,
    };
  }

  /**
   * Execute a Cloud Bridge request with full audit trail integration.
   *
   * 1. Classifies content categories
   * 2. Logs request to audit chain BEFORE execution
   * 3. Makes the API call via the adapter
   * 4. Logs response to audit chain
   * 5. Updates usage tracking and spending cap
   * 6. Handles errors with graceful degradation
   */
  async executeCloudRequest(
    request: CloudBridgeRequest,
  ): Promise<CloudBridgeResponse | null> {
    const startTime = Date.now();

    // Classify content
    const promptText = request.messages.map(m => m.content).join(' ');
    const classification = classifyContent(promptText);
    request.metadata.contentCategories = classification.categories;

    // Compute prompt content hash for audit (NEVER log the content itself)
    const promptHash = sha256(promptText);

    try {
      // Execute via adapter
      const response = await this.adapter.execute(request);

      // Compute response hash
      const responseHash = sha256(response.message.content);

      // Estimate cost
      const provider = this.registry.getProvider(request.provider);
      const model = provider?.models.find(m => m.id === request.model);
      let estimatedCostCents: number | null = null;
      if (model?.costPerInputToken && model?.costPerOutputToken) {
        estimatedCostCents = Math.round(
          (response.tokensUsed.prompt * model.costPerInputToken +
            response.tokensUsed.completion * model.costPerOutputToken) * 100,
        );
      }

      // Log to audit chain
      this.logAuditEntry({
        type: 'cloud_bridge_request',
        timestamp: startTime,
        provider: request.provider,
        model: request.model,
        subagentId: request.subagentId,
        taskType: request.metadata.taskType,
        domain: request.metadata.domain,
        tokensIn: response.tokensUsed.prompt,
        tokensOut: response.tokensUsed.completion,
        estimatedCost: estimatedCostCents,
        contentCategoriesDetected: classification.categories,
        promptContentHash: promptHash,
        responseContentHash: responseHash,
        routingMode: this.policy.mode,
        latencyMs: response.durationMs,
      });

      // Update usage tracking
      this.registry.recordUsage(
        request.provider,
        response.tokensUsed.prompt,
        response.tokensUsed.completion,
        estimatedCostCents,
      );

      // Update spending cap
      if (this.policy.spendingCap.enabled && estimatedCostCents !== null) {
        this.policy.spendingCap.currentSpend += estimatedCostCents;
      }

      return response;

    } catch (error) {
      const errorMsg = (error as Error).message;

      // Classify the error for graceful degradation
      if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
        this.registry.setStatus(request.provider, 'rate_limited', errorMsg);
        this.onNotify(`Cloud Bridge provider ${request.provider} rate limited. Falling back to local.`, 'info');
      } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
        this.registry.setStatus(request.provider, 'error', 'API key invalid or revoked');
        this.onNotify(`Cloud Bridge API key for ${request.provider} is invalid. Please re-enter in Settings.`, 'warning');
      } else if (errorMsg.includes('Connection failed') || errorMsg.includes('fetch failed')) {
        this.registry.setStatus(request.provider, 'error', 'Network unreachable');
        this.onNotify('Network offline. All inference running locally.', 'info');
      } else {
        this.registry.setStatus(request.provider, 'error', errorMsg);
      }

      // Return null — caller falls back to local inference
      return null;
    }
  }

  /**
   * Build a CloudBridgeRequest from a routing decision and inference parameters.
   */
  buildRequest(
    decision: RoutingDecision,
    messages: Array<{ role: string; content: string }>,
    options: {
      subagentId?: string;
      taskType?: string;
      domain?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    },
  ): CloudBridgeRequest {
    return {
      id: `cb_${nanoid(12)}`,
      subagentId: options.subagentId ?? 'coordinator',
      provider: decision.provider!,
      model: decision.model!,
      messages,
      tools: options.tools,
      maxTokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      metadata: {
        taskType: options.taskType ?? 'general',
        domain: options.domain ?? 'general',
        contentCategories: [],
        estimatedCost: null,
      },
    };
  }
}

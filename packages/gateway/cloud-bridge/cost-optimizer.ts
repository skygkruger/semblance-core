// Cost Optimizer — Estimates token cost before routing and selects the cheapest
// model that meets a quality threshold.
//
// Features:
//   - Pre-route cost estimation
//   - Provider preference ranking with fallback
//   - Model selection: cheapest model that can handle the task complexity
//   - Spending cap pre-check: if estimated cost would exceed remaining cap, decline
//   - Per-provider, per-model cost tracking
//
// This file is in packages/gateway/. No packages/core/ boundary violation.

import type { CloudBridgeRoutingPolicy, CloudBridgeModel } from '@semblance/core';
import { ProviderRegistry } from './provider-registry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CostEstimate {
  provider: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostCents: number | null;
  canAfford: boolean;
  reason: string;
}

export interface ProviderRanking {
  /** Ordered list of provider IDs (first = preferred) */
  providers: string[];
}

// ─── Model Complexity Tiers ───────────────────────────────────────────────────

type ComplexityTier = 'simple' | 'moderate' | 'complex';

/** Map task characteristics to a model complexity tier. */
function assessComplexity(
  inputTokens: number,
  domain: string,
): ComplexityTier {
  // High-stakes domains always get the best available model
  if (['finances', 'legal', 'health'].includes(domain)) return 'complex';
  // Long context = more complex
  if (inputTokens > 4000) return 'complex';
  if (inputTokens > 1000) return 'moderate';
  return 'simple';
}

/** Rough cost tier for a model based on its per-token pricing. */
function modelCostTier(model: CloudBridgeModel): 'cheap' | 'mid' | 'expensive' {
  const costPerOutputToken = model.costPerOutputToken ?? 0;
  if (costPerOutputToken <= 0.000001) return 'cheap';     // Haiku, Flash, mini
  if (costPerOutputToken <= 0.000015) return 'mid';       // Sonnet, GPT-4o
  return 'expensive';                                      // Opus, o3
}

/** Whether a model tier is sufficient for a given complexity. */
function modelSufficient(tier: 'cheap' | 'mid' | 'expensive', complexity: ComplexityTier): boolean {
  if (complexity === 'simple') return true; // Any model works for simple tasks
  if (complexity === 'moderate') return tier !== 'cheap';
  return tier === 'expensive'; // Complex tasks need the best
}

// ─── Cost Optimizer ───────────────────────────────────────────────────────────

export class CostOptimizer {
  private registry: ProviderRegistry;
  private providerRanking: string[] = [];

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  /** Set the user's preferred provider ordering. */
  setRanking(ranking: ProviderRanking): void {
    this.providerRanking = [...ranking.providers];
  }

  /** Get the current provider ranking. */
  getRanking(): ProviderRanking {
    return { providers: [...this.providerRanking] };
  }

  /**
   * Estimate cost and select the best provider+model for a request.
   *
   * Returns null if no provider/model can handle the request within budget.
   */
  estimate(
    messages: Array<{ role: string; content: string }>,
    maxOutputTokens: number,
    domain: string,
    policy: CloudBridgeRoutingPolicy,
  ): CostEstimate | null {
    // Estimate input tokens (~4 chars per token)
    const inputChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedInputTokens = Math.ceil(inputChars / 4);
    const estimatedOutputTokens = maxOutputTokens;

    const complexity = assessComplexity(estimatedInputTokens, domain);

    // Build ordered candidate list: ranked providers first, then remaining
    const connected = this.registry.getConnectedProviders();
    const candidates: Array<{ provider: string; model: CloudBridgeModel }> = [];

    // Ranked providers first
    for (const providerId of this.providerRanking) {
      const provider = connected.find(p => p.id === providerId && p.status === 'connected');
      if (!provider) continue;
      for (const model of provider.models) {
        candidates.push({ provider: providerId, model });
      }
    }

    // Then remaining connected providers not in ranking
    for (const provider of connected) {
      if (this.providerRanking.includes(provider.id)) continue;
      for (const model of provider.models) {
        candidates.push({ provider: provider.id, model });
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    // Filter to models sufficient for the complexity, then sort by cost
    const viable = candidates
      .filter(c => modelSufficient(modelCostTier(c.model), complexity))
      .sort((a, b) => {
        const costA = (a.model.costPerOutputToken ?? 0);
        const costB = (b.model.costPerOutputToken ?? 0);
        return costA - costB; // Cheapest first
      });

    if (viable.length === 0) {
      // Fall back to any model (complexity filter was too strict)
      viable.push(...candidates.sort((a, b) => {
        const costA = (a.model.costPerOutputToken ?? 0);
        const costB = (b.model.costPerOutputToken ?? 0);
        return costA - costB;
      }));
    }

    // Select the cheapest viable option
    const selected = viable[0];
    if (!selected) return null;

    const estimatedCostCents = this.computeCost(
      selected.model,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    // Check spending cap
    const canAfford = !policy.spendingCap.enabled ||
      (policy.spendingCap.currentSpend + (estimatedCostCents ?? 0)) <= policy.spendingCap.monthlyLimit;

    return {
      provider: selected.provider,
      model: selected.model.id,
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCostCents,
      canAfford,
      reason: canAfford
        ? `Selected ${selected.model.displayName} (${selected.provider}) — estimated ${estimatedCostCents !== null ? `$${(estimatedCostCents / 100).toFixed(4)}` : 'unknown cost'}`
        : `Estimated cost ($${((estimatedCostCents ?? 0) / 100).toFixed(4)}) would exceed remaining spending cap`,
    };
  }

  /**
   * Select the next available provider when the preferred one is unavailable.
   * Walks the ranking in order, skipping unavailable providers.
   */
  selectFallbackProvider(excludeProvider: string): { provider: string; model: string } | null {
    const connected = this.registry.getConnectedProviders();

    // Try ranked providers first
    for (const providerId of this.providerRanking) {
      if (providerId === excludeProvider) continue;
      const provider = connected.find(p => p.id === providerId);
      if (provider) {
        const model = this.registry.getDefaultModel(providerId);
        if (model) return { provider: providerId, model: model.id };
      }
    }

    // Try any remaining connected provider
    for (const provider of connected) {
      if (provider.id === excludeProvider) continue;
      const model = this.registry.getDefaultModel(provider.id);
      if (model) return { provider: provider.id, model: model.id };
    }

    return null;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private computeCost(
    model: CloudBridgeModel,
    inputTokens: number,
    outputTokens: number,
  ): number | null {
    if (model.costPerInputToken === null || model.costPerOutputToken === null) {
      return null;
    }
    // Cost in cents
    return Math.round(
      (inputTokens * model.costPerInputToken + outputTokens * model.costPerOutputToken) * 100,
    );
  }
}

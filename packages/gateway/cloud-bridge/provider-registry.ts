// Cloud Bridge Provider Registry — Manages connected cloud AI providers.
//
// Tracks provider status, usage, and connection state.
// This is the Gateway-side state manager. It does NOT store credentials
// (those are in the OS keychain via CloudBridgeCredentialStore).
//
// This file is in packages/gateway/. Network access is permitted here.

import type {
  CloudBridgeProvider,
  CloudBridgeModel,
  KnownProviderConfig,
} from '@semblance/core';
import { KNOWN_PROVIDERS, getKnownProvider } from '@semblance/core';

/**
 * ProviderRegistry — In-memory registry of connected Cloud Bridge providers.
 *
 * Tracks which providers are connected, their status, models, and usage.
 * Provider data is ephemeral (rebuilt on startup from keychain credentials).
 */
export class ProviderRegistry {
  private providers: Map<string, CloudBridgeProvider> = new Map();

  /**
   * Register a provider as connected after API key validation succeeds.
   */
  registerProvider(config: {
    id: string;
    name: string;
    models: CloudBridgeModel[];
    storageKey: string;
    baseUrl?: string;
  }): CloudBridgeProvider {
    const provider: CloudBridgeProvider = {
      id: config.id,
      name: config.name,
      connectionType: 'api_key',
      status: 'connected',
      models: config.models,
      usageThisMonth: {
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        estimatedCost: null,
      },
      credentials: {
        storageKey: config.storageKey,
        expiresAt: null,
      },
      baseUrl: config.baseUrl ?? null,
      lastValidatedAt: new Date().toISOString(),
      errorMessage: null,
    };

    this.providers.set(config.id, provider);
    return provider;
  }

  /**
   * Unregister a provider (disconnected by user).
   */
  unregisterProvider(id: string): void {
    this.providers.delete(id);
  }

  /**
   * Get a provider by ID.
   */
  getProvider(id: string): CloudBridgeProvider | null {
    return this.providers.get(id) ?? null;
  }

  /**
   * List all registered providers.
   */
  listProviders(): CloudBridgeProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all connected (healthy) providers.
   */
  getConnectedProviders(): CloudBridgeProvider[] {
    return this.listProviders().filter(p => p.status === 'connected');
  }

  /**
   * Update provider status.
   */
  setStatus(id: string, status: CloudBridgeProvider['status'], errorMessage?: string): void {
    const provider = this.providers.get(id);
    if (provider) {
      provider.status = status;
      provider.errorMessage = errorMessage ?? null;
    }
  }

  /**
   * Record a Cloud Bridge request in the usage tracker.
   */
  recordUsage(
    id: string,
    tokensIn: number,
    tokensOut: number,
    costCents: number | null,
  ): void {
    const provider = this.providers.get(id);
    if (provider) {
      provider.usageThisMonth.requests++;
      provider.usageThisMonth.tokensIn += tokensIn;
      provider.usageThisMonth.tokensOut += tokensOut;
      if (costCents !== null) {
        provider.usageThisMonth.estimatedCost =
          (provider.usageThisMonth.estimatedCost ?? 0) + costCents;
      }
    }
  }

  /**
   * Reset monthly usage counters (called at month boundary).
   */
  resetMonthlyUsage(): void {
    for (const provider of this.providers.values()) {
      provider.usageThisMonth = {
        requests: 0,
        tokensIn: 0,
        tokensOut: 0,
        estimatedCost: null,
      };
    }
  }

  /**
   * Get the best model for a given provider, optionally filtered by capability.
   */
  getDefaultModel(providerId: string): CloudBridgeModel | null {
    const provider = this.providers.get(providerId);
    if (!provider || provider.models.length === 0) return null;
    // Return the first model with tool support, or the first model if none have tools
    return provider.models.find(m => m.supportsTools) ?? provider.models[0] ?? null;
  }

  /**
   * Check if any provider is connected and available.
   */
  hasConnectedProvider(): boolean {
    return this.getConnectedProviders().length > 0;
  }
}

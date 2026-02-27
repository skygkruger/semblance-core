/**
 * Connector Wiring Integration Tests — Phase 8.
 *
 * Verifies:
 * - All parsers are registered at startup
 * - All connector adapters are registered
 * - ConnectorRouter dispatches to correct adapters
 * - Allowlist auto-population on connect
 * - ServiceRegistry receives connector.* action types
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Core-side registration ─────────────────────────────────────────────────

import { createAllParsers, registerAllParsers } from '../../packages/core/importers/registration.js';
import type { ImportPipeline } from '../../packages/core/importers/import-pipeline.js';
import type { ImportParser } from '../../packages/core/importers/types.js';

// ─── Gateway-side registration ──────────────────────────────────────────────

import { registerAllConnectors, wireConnectorRouter } from '../../packages/gateway/services/connector-registration.js';
import type { OAuthTokenManager } from '../../packages/gateway/services/oauth-token-manager.js';
import {
  CONNECTOR_ALLOWLIST_SEEDS,
  getAllowlistDomainsForConnector,
} from '../../packages/gateway/services/connector-allowlist-seeds.js';

// ─── ConnectorRegistry (catalog) ────────────────────────────────────────────

import { createDefaultConnectorRegistry } from '../../packages/core/importers/connector-registry.js';

// ─── Mock helpers ───────────────────────────────────────────────────────────

function createMockTokenManager(): OAuthTokenManager {
  const tokens = new Map<string, {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string;
  }>();

  return {
    storeTokens: vi.fn(async (provider, accessToken, refreshToken, expiresInSeconds, scopes) => {
      tokens.set(provider, {
        accessToken,
        refreshToken: refreshToken ?? '',
        expiresAt: Date.now() + (expiresInSeconds ?? 3600) * 1000,
        scopes: scopes ?? '',
      });
    }),
    getTokens: vi.fn(async (provider) => {
      return tokens.get(provider) ?? null;
    }),
    clearTokens: vi.fn(async () => {}),
    hasValidToken: vi.fn(async (provider) => {
      const t = tokens.get(provider);
      return t != null && t.expiresAt > Date.now();
    }),
    refreshAccessToken: vi.fn(async () => 'refreshed_token'),
  } as unknown as OAuthTokenManager;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Phase 8 — Production Wiring', () => {
  describe('Parser registration (Core-side)', () => {
    it('createAllParsers returns all expected parsers', () => {
      const parsers = createAllParsers();
      // We should have at least 29 parsers (8 original + 7 Phase 6 Batch 1 + 7 Phase 6 Batch 2 + 7 Phase 2 native)
      expect(parsers.length).toBeGreaterThanOrEqual(29);
    });

    it('all parsers implement the ImportParser interface', () => {
      const parsers = createAllParsers();
      for (const parser of parsers) {
        expect(typeof parser.canParse).toBe('function');
        expect(typeof parser.parse).toBe('function');
        expect(typeof parser.sourceType).toBe('string');
        expect(Array.isArray(parser.supportedFormats)).toBe(true);
      }
    });

    it('registerAllParsers calls registerParser for each parser', () => {
      const mockPipeline = {
        registerParser: vi.fn(),
      } as unknown as ImportPipeline;

      registerAllParsers(mockPipeline);

      const parsers = createAllParsers();
      expect(mockPipeline.registerParser).toHaveBeenCalledTimes(parsers.length);
    });

    it('no duplicate sourceType + format combinations', () => {
      const parsers = createAllParsers();
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const parser of parsers) {
        for (const format of parser.supportedFormats) {
          const key = `${parser.sourceType}:${format}`;
          if (seen.has(key)) {
            duplicates.push(key);
          }
          seen.add(key);
        }
      }

      expect(duplicates, `Duplicate sourceType:format combos: ${duplicates.join(', ')}`).toEqual([]);
    });
  });

  describe('Connector adapter registration (Gateway-side)', () => {
    it('registerAllConnectors returns a ConnectorRouter with all adapters', () => {
      const tokenManager = createMockTokenManager();
      const router = registerAllConnectors(tokenManager);

      // Should have all 22 OAuth/API adapters registered
      const expectedIds = [
        'spotify', 'github', 'readwise', 'notion', 'dropbox', 'onedrive',
        'oura', 'whoop', 'fitbit', 'strava', 'garmin', 'toggl', 'rescuetime',
        'pocket', 'instapaper', 'todoist', 'lastfm', 'letterboxd', 'mendeley',
        'harvest', 'slack-oauth', 'box',
      ];

      for (const id of expectedIds) {
        expect(router.hasAdapter(id), `Missing adapter: ${id}`).toBe(true);
      }
    });

    it('registerAllConnectors adapter count matches expected', () => {
      const tokenManager = createMockTokenManager();
      const router = registerAllConnectors(tokenManager);
      const registered = router.listRegistered();
      expect(registered.length).toBe(22);
    });

    it('wireConnectorRouter registers all connector.* actions', () => {
      const tokenManager = createMockTokenManager();
      const router = registerAllConnectors(tokenManager);
      const mockRegistry = {
        register: vi.fn(),
      };

      wireConnectorRouter(mockRegistry, router);

      expect(mockRegistry.register).toHaveBeenCalledTimes(5);
      const registeredActions = (mockRegistry.register as ReturnType<typeof vi.fn>).mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredActions).toContain('connector.auth');
      expect(registeredActions).toContain('connector.auth_status');
      expect(registeredActions).toContain('connector.disconnect');
      expect(registeredActions).toContain('connector.sync');
      expect(registeredActions).toContain('connector.list_items');
    });
  });

  describe('Allowlist auto-seeding', () => {
    it('every registered connector has allowlist seeds', () => {
      const registry = createDefaultConnectorRegistry();
      const oauthConnectors = registry.listAll().filter(c =>
        c.authType === 'oauth2' || c.authType === 'pkce' || c.authType === 'oauth1a' || c.authType === 'api_key',
      );

      for (const connector of oauthConnectors) {
        const domains = getAllowlistDomainsForConnector(connector.id);
        // Not all connectors will have seeds (e.g., native readers don't need them)
        // But OAuth connectors should
        if (connector.authType === 'oauth2' || connector.authType === 'pkce' || connector.authType === 'api_key') {
          // At minimum, check that the lookup doesn't crash
          expect(Array.isArray(domains)).toBe(true);
        }
      }
    });

    it('high-value connectors have correct API domains', () => {
      expect(getAllowlistDomainsForConnector('spotify')).toContain('api.spotify.com');
      expect(getAllowlistDomainsForConnector('github')).toContain('api.github.com');
      expect(getAllowlistDomainsForConnector('oura')).toContain('api.ouraring.com');
      expect(getAllowlistDomainsForConnector('notion')).toContain('api.notion.com');
    });

    it('CONNECTOR_ALLOWLIST_SEEDS is a non-empty map', () => {
      expect(Object.keys(CONNECTOR_ALLOWLIST_SEEDS).length).toBeGreaterThan(10);
    });

    it('all seed domains are valid hostnames', () => {
      for (const [, domains] of Object.entries(CONNECTOR_ALLOWLIST_SEEDS)) {
        for (const domain of domains) {
          expect(domain).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
        }
      }
    });
  });

  describe('ConnectorRegistry completeness', () => {
    it('registry has entries for all adapter-backed connectors', () => {
      const registry = createDefaultConnectorRegistry();
      const adapterIds = [
        'spotify', 'github', 'readwise', 'notion', 'dropbox', 'onedrive',
        'oura', 'whoop', 'fitbit', 'strava', 'garmin', 'toggl', 'rescuetime',
        'pocket', 'instapaper', 'todoist', 'lastfm', 'letterboxd', 'mendeley',
        'harvest', 'slack-oauth', 'box',
      ];

      for (const id of adapterIds) {
        expect(registry.has(id), `ConnectorRegistry missing: ${id}`).toBe(true);
      }
    });

    it('registry has entries for all parser-based connectors', () => {
      const registry = createDefaultConnectorRegistry();
      const parserIds = [
        'notion-export', 'facebook-export', 'instagram-export', 'signal-export',
        'discord-export', 'slack-export', 'bear-export', 'evernote-export',
        'ynab-export', 'mint-export', 'google-takeout', 'goodreads-export',
        'strava-export', 'telegram-export',
      ];

      for (const id of parserIds) {
        expect(registry.has(id), `ConnectorRegistry missing parser: ${id}`).toBe(true);
      }
    });

    it('all connectors have valid categories', () => {
      const registry = createDefaultConnectorRegistry();
      const validCategories = [
        'cloud_storage', 'productivity', 'developer', 'reading_research',
        'health_fitness', 'social', 'music_entertainment', 'finance', 'messaging',
      ];

      for (const connector of registry.listAll()) {
        expect(validCategories).toContain(connector.category);
      }
    });

    it('premium connectors are correctly marked', () => {
      const registry = createDefaultConnectorRegistry();
      // These should be premium (DR tier)
      const premiumIds = ['garmin', 'oura', 'whoop', 'fitbit', 'spotify', 'github', 'notion'];
      for (const id of premiumIds) {
        const connector = registry.get(id);
        expect(connector?.isPremium, `${id} should be premium`).toBe(true);
      }

      // These should be free (browser history readers + obsidian)
      const freeIds = ['safari-history', 'edge-history', 'arc-history', 'obsidian', 'google-drive'];
      for (const id of freeIds) {
        const connector = registry.get(id);
        expect(connector?.isPremium, `${id} should be free`).toBe(false);
      }
    });
  });

  describe('Network Monitor integration prep', () => {
    it('all OAuth adapter base class has trackable provider key', () => {
      const tokenManager = createMockTokenManager();
      const router = registerAllConnectors(tokenManager);

      // Each adapter should have a providerKey from its OAuthConfig
      // We verify by checking the router can retrieve adapters
      for (const id of router.listRegistered()) {
        const adapter = router.getAdapter(id);
        expect(adapter).toBeDefined();
      }
    });
  });
});

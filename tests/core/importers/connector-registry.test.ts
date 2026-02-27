/**
 * ConnectorRegistry Tests — Catalog of all connector definitions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConnectorRegistry,
  createDefaultConnectorRegistry,
} from '../../../packages/core/importers/connector-registry.js';
import type { ConnectorDefinition } from '../../../packages/core/importers/connector-status.js';

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  const sampleDef: ConnectorDefinition = {
    id: 'test-connector',
    displayName: 'Test Connector',
    description: 'A test connector',
    category: 'productivity',
    authType: 'oauth2',
    platform: 'all',
    isPremium: false,
    syncIntervalHours: 6,
  };

  it('registers and retrieves a connector by ID', () => {
    registry.register(sampleDef);
    expect(registry.get('test-connector')).toEqual(sampleDef);
  });

  it('returns undefined for unregistered connector', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('has() returns true for registered connectors', () => {
    registry.register(sampleDef);
    expect(registry.has('test-connector')).toBe(true);
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('listAll() returns all registered connectors', () => {
    registry.register(sampleDef);
    registry.register({ ...sampleDef, id: 'second', displayName: 'Second' });
    expect(registry.listAll()).toHaveLength(2);
  });

  it('listByCategory() filters correctly', () => {
    registry.register(sampleDef);
    registry.register({ ...sampleDef, id: 'health1', category: 'health_fitness' });
    registry.register({ ...sampleDef, id: 'health2', category: 'health_fitness' });

    const health = registry.listByCategory('health_fitness');
    expect(health).toHaveLength(2);
    expect(health.every(c => c.category === 'health_fitness')).toBe(true);
  });

  it('listByPlatform() includes "all" and matching platform', () => {
    registry.register(sampleDef); // platform: 'all'
    registry.register({ ...sampleDef, id: 'mac-only', platform: 'macos' });
    registry.register({ ...sampleDef, id: 'win-only', platform: 'windows' });

    const macConnectors = registry.listByPlatform('macos');
    expect(macConnectors).toHaveLength(2); // 'all' + 'macos'
    expect(macConnectors.map(c => c.id)).toContain('test-connector');
    expect(macConnectors.map(c => c.id)).toContain('mac-only');
  });

  it('listPremium() and listFree() separate correctly', () => {
    registry.register(sampleDef); // isPremium: false
    registry.register({ ...sampleDef, id: 'premium1', isPremium: true });

    expect(registry.listFree()).toHaveLength(1);
    expect(registry.listPremium()).toHaveLength(1);
  });

  it('getCategories() returns unique categories', () => {
    registry.register(sampleDef);
    registry.register({ ...sampleDef, id: 'health1', category: 'health_fitness' });
    registry.register({ ...sampleDef, id: 'health2', category: 'health_fitness' });

    const categories = registry.getCategories();
    expect(categories).toHaveLength(2);
    expect(categories).toContain('productivity');
    expect(categories).toContain('health_fitness');
  });

  it('size reflects registered count', () => {
    expect(registry.size).toBe(0);
    registry.register(sampleDef);
    expect(registry.size).toBe(1);
  });
});

describe('createDefaultConnectorRegistry', () => {
  it('returns a registry with all built-in connectors', () => {
    const registry = createDefaultConnectorRegistry();
    // We registered 40+ connectors in the default registry
    expect(registry.size).toBeGreaterThan(30);
  });

  it('includes expected connectors by ID', () => {
    const registry = createDefaultConnectorRegistry();
    expect(registry.has('spotify')).toBe(true);
    expect(registry.has('github')).toBe(true);
    expect(registry.has('google-drive')).toBe(true);
    expect(registry.has('oura')).toBe(true);
    expect(registry.has('garmin')).toBe(true);
    expect(registry.has('imessage')).toBe(true);
  });

  it('Slack OAuth and Slack export have distinct IDs', () => {
    const registry = createDefaultConnectorRegistry();
    expect(registry.has('slack-oauth')).toBe(true);
    expect(registry.has('slack-export')).toBe(true);
    const oauth = registry.get('slack-oauth')!;
    const exp = registry.get('slack-export')!;
    expect(oauth.authType).toBe('oauth2');
    expect(exp.authType).toBe('native');
  });

  it('iMessage is macOS-only', () => {
    const registry = createDefaultConnectorRegistry();
    const imessage = registry.get('imessage')!;
    expect(imessage.platform).toBe('macos');
  });
});

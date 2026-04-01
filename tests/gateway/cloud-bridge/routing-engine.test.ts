// Tests for Cloud Bridge Routing Engine — routing decisions, content classification,
// spending caps, graceful degradation, and audit trail integration.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloudBridgeRoutingEngine } from '@semblance/gateway/cloud-bridge/routing-engine.js';
import { ProviderRegistry } from '@semblance/gateway/cloud-bridge/provider-registry.js';
import { CloudBridgeAdapter } from '@semblance/gateway/cloud-bridge/cloud-bridge-adapter.js';
import { classifyContent, checkExclusions } from '@semblance/gateway/cloud-bridge/content-classifier.js';
import { DEFAULT_ROUTING_POLICY, getKnownProvider } from '@semblance/core';
import type { CloudBridgeRoutingPolicy, CloudBridgeAuditEntry } from '@semblance/core';

// ─── Content Classifier ───────────────────────────────────────────────────────

describe('Content Classifier', () => {
  it('detects financial content', () => {
    const result = classifyContent('My bank account balance is $5,000 and I need to review my transactions');
    expect(result.categories).toContain('financial');
    expect(result.confidence.financial).toBeGreaterThan(0);
  });

  it('detects health content', () => {
    const result = classifyContent('My blood pressure reading was 120/80 and the doctor prescribed new medication');
    expect(result.categories).toContain('health');
  });

  it('detects legal content', () => {
    const result = classifyContent('Please review the NDA and non-disclosure agreement my attorney sent');
    expect(result.categories).toContain('legal');
  });

  it('detects personal identifiers', () => {
    const result = classifyContent('My social security number is on my passport and drivers license');
    expect(result.categories).toContain('personal_id');
  });

  it('detects contact information', () => {
    const result = classifyContent('Send it to john@example.com at 123 Main St');
    expect(result.categories).toContain('contact_info');
  });

  it('classifies general content with no sensitive data', () => {
    const result = classifyContent('What is the weather like tomorrow?');
    expect(result.categories).toEqual(['general']);
  });

  it('detects multiple categories', () => {
    const result = classifyContent(
      'Review my bank statement with the $500 payment and the medical prescription from my hospital visit'
    );
    expect(result.categories).toContain('financial');
    expect(result.categories).toContain('health');
  });
});

describe('Content Exclusion Check', () => {
  it('returns empty when no exclusions match', () => {
    const violations = checkExclusions('What time is the meeting?', ['financial', 'health']);
    expect(violations).toHaveLength(0);
  });

  it('returns matching exclusions', () => {
    const violations = checkExclusions(
      'Transfer $500 from my bank account',
      ['financial', 'health'],
    );
    expect(violations).toContain('financial');
  });

  it('returns empty when no categories are excluded', () => {
    const violations = checkExclusions('Check my bank balance', []);
    expect(violations).toHaveLength(0);
  });
});

// ─── Routing Engine ───────────────────────────────────────────────────────────

describe('CloudBridgeRoutingEngine', () => {
  let registry: ProviderRegistry;
  let adapter: CloudBridgeAdapter;
  let engine: CloudBridgeRoutingEngine;
  let auditEntries: CloudBridgeAuditEntry[];
  let notifications: Array<{ message: string; level: string }>;

  beforeEach(() => {
    registry = new ProviderRegistry();
    adapter = new CloudBridgeAdapter({
      getApiKey: vi.fn().mockResolvedValue('test-key'),
    });
    auditEntries = [];
    notifications = [];

    engine = new CloudBridgeRoutingEngine({
      providerRegistry: registry,
      adapter,
      logAuditEntry: (entry) => auditEntries.push(entry),
      onNotify: (message, level) => notifications.push({ message, level }),
    });
  });

  describe('Routing Decisions', () => {
    it('routes to local when Cloud Bridge is off (default)', () => {
      const decision = engine.decide('email', 'Draft an email to John');
      expect(decision.route).toBe('local');
      expect(decision.reason).toContain('disabled');
    });

    it('routes to local when no provider is connected', () => {
      engine.setPolicy({ ...DEFAULT_ROUTING_POLICY, mode: 'smart' });
      const decision = engine.decide('email', 'Draft an email');
      expect(decision.route).toBe('local');
      expect(decision.reason).toContain('No connected');
    });

    it('routes to cloud in always mode with connected provider', () => {
      engine.setPolicy({ ...DEFAULT_ROUTING_POLICY, mode: 'always' });
      const anthropicModels = getKnownProvider('anthropic')!.models;
      registry.registerProvider({
        id: 'anthropic',
        name: 'Anthropic',
        models: anthropicModels,
        storageKey: 'key',
      });

      const decision = engine.decide('email', 'Draft an email to the team');
      expect(decision.route).toBe('cloud_bridge');
      expect(decision.provider).toBe('anthropic');
      expect(decision.model).toBeTruthy();
    });

    it('routes to local in manual mode without explicit request', () => {
      engine.setPolicy({ ...DEFAULT_ROUTING_POLICY, mode: 'manual' });
      registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k' });

      const decision = engine.decide('email', 'Draft an email');
      expect(decision.route).toBe('local');
    });

    it('routes to cloud in manual mode with explicit request', () => {
      engine.setPolicy({ ...DEFAULT_ROUTING_POLICY, mode: 'manual' });
      registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k' });

      const decision = engine.decide('email', 'Draft an email', { forceCloud: true });
      expect(decision.route).toBe('cloud_bridge');
    });

    it('respects never_cloud domain rule', () => {
      engine.setPolicy({
        ...DEFAULT_ROUTING_POLICY,
        mode: 'always',
        domainRules: { finances: { routing: 'never_cloud' } },
      });
      registry.registerProvider({ id: 'anthropic', name: 'A', models: [], storageKey: 'k' });

      const decision = engine.decide('finances', 'Show my transactions');
      expect(decision.route).toBe('local');
      expect(decision.reason).toContain('never use cloud');
    });

    it('blocks content with excluded categories', () => {
      engine.setPolicy({
        ...DEFAULT_ROUTING_POLICY,
        mode: 'always',
        excludedCategories: ['financial'],
      });
      registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k' });

      const decision = engine.decide('email', 'Transfer $500 from my bank account');
      expect(decision.route).toBe('local');
      expect(decision.blockedCategories).toContain('financial');
    });

    it('enforces spending cap', () => {
      engine.setPolicy({
        ...DEFAULT_ROUTING_POLICY,
        mode: 'always',
        spendingCap: { enabled: true, monthlyLimit: 100, currentSpend: 150 },
      });
      registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k' });

      const decision = engine.decide('email', 'Draft an email');
      expect(decision.route).toBe('local');
      expect(decision.reason).toContain('spending cap');
    });

    it('respects domain-specific provider preference', () => {
      engine.setPolicy({
        ...DEFAULT_ROUTING_POLICY,
        mode: 'smart',
        domainRules: {
          email: { routing: 'cloud', preferredProvider: 'openai', preferredModel: 'gpt-4o' },
        },
      });
      registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k1' });
      registry.registerProvider({ id: 'openai', name: 'O', models: getKnownProvider('openai')!.models, storageKey: 'k2' });

      const decision = engine.decide('email', 'Draft a professional email');
      expect(decision.route).toBe('cloud_bridge');
      expect(decision.provider).toBe('openai');
      expect(decision.model).toBe('gpt-4o');
    });
  });

  describe('Default State', () => {
    it('default policy has Cloud Bridge OFF', () => {
      const policy = engine.getPolicy();
      expect(policy.mode).toBe('off');
    });

    it('default policy excludes financial and health data', () => {
      const policy = engine.getPolicy();
      expect(policy.excludedCategories).toContain('financial');
      expect(policy.excludedCategories).toContain('health');
    });
  });
});

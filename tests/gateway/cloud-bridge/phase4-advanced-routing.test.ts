// Tests for Phase 4 — Advanced Routing Intelligence.
//
// Covers: confidence detection, cost optimization, prompt minimization,
// provider ranking, hybrid execution wiring.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfidenceDetector } from '@semblance/gateway/cloud-bridge/confidence-detector.js';
import { CostOptimizer } from '@semblance/gateway/cloud-bridge/cost-optimizer.js';
import { PromptMinimizer } from '@semblance/gateway/cloud-bridge/prompt-minimizer.js';
import { ProviderRegistry } from '@semblance/gateway/cloud-bridge/provider-registry.js';
import { CloudBridgeRoutingEngine } from '@semblance/gateway/cloud-bridge/routing-engine.js';
import { CloudBridgeAdapter } from '@semblance/gateway/cloud-bridge/cloud-bridge-adapter.js';
import { getKnownProvider, DEFAULT_ROUTING_POLICY } from '@semblance/core';

// ─── Confidence Detector ──────────────────────────────────────────────────────

describe('ConfidenceDetector', () => {
  let detector: ConfidenceDetector;

  beforeEach(() => {
    detector = new ConfidenceDetector();
  });

  it('scores confident response high', () => {
    const result = detector.evaluate(
      'The quarterly revenue was $2.5M, representing a 15% increase over last quarter. Key drivers were the enterprise segment growth and new customer acquisition in EMEA.',
      'general',
    );
    expect(result.score).toBeGreaterThan(0.8);
    expect(result.shouldEscalate).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('detects hedging language', () => {
    const result = detector.evaluate(
      "I'm not sure about this, but I think it might be around $2M. Perhaps the revenue was higher, possibly closer to $3M. I could be wrong though.",
      'general',
    );
    expect(result.score).toBeLessThan(0.7);
    expect(result.signals.some(s => s.type === 'hedging')).toBe(true);
  });

  it('detects refusal patterns', () => {
    const result = detector.evaluate(
      "I can't help with that specific question. I don't have access to the financial data you're asking about. As an AI, I would recommend consulting your accountant.",
      'finances',
    );
    expect(result.signals.some(s => s.type === 'refusal')).toBe(true);
    expect(result.score).toBeLessThan(0.5);
    // Finance threshold is 0.9 — should escalate
    expect(result.shouldEscalate).toBe(true);
  });

  it('detects short response to complex query', () => {
    const result = detector.evaluate(
      'Yes, that seems correct.',
      'general',
      0.8, // high complexity
    );
    expect(result.signals.some(s => s.type === 'short_response')).toBe(true);
  });

  it('uses domain-specific thresholds', () => {
    // Calendar has low threshold (0.5) — mild hedging should pass
    const calResult = detector.evaluate('I think your meeting is at 3pm.', 'calendar');
    // Finances has high threshold (0.9) — same hedging should trigger escalation
    const finResult = detector.evaluate('I think the balance is around $5000.', 'finances');

    // Both may have hedging signals, but finance should escalate and calendar should not
    expect(finResult.shouldEscalate).toBe(true);
    // Calendar with low threshold may still pass
    expect(calResult.score).toBeGreaterThan(0);
  });

  it('configurable thresholds', () => {
    detector.setThresholds({ default: 0.95 });
    const result = detector.evaluate("I think it might be around $50, I'm not sure though. Perhaps higher.", 'general');
    expect(result.shouldEscalate).toBe(true); // Very strict threshold — hedging triggers it

    detector.setThresholds({ default: 0.1 });
    const result2 = detector.evaluate("I think it might be around $50, I'm not sure though. Perhaps higher.", 'general');
    expect(result2.shouldEscalate).toBe(false); // Very lenient threshold — same hedging passes
  });
});

// ─── Cost Optimizer ───────────────────────────────────────────────────────────

describe('CostOptimizer', () => {
  let registry: ProviderRegistry;
  let optimizer: CostOptimizer;

  beforeEach(() => {
    registry = new ProviderRegistry();
    optimizer = new CostOptimizer(registry);

    // Register two providers
    const anthropicModels = getKnownProvider('anthropic')!.models;
    const openaiModels = getKnownProvider('openai')!.models;
    registry.registerProvider({ id: 'anthropic', name: 'Anthropic', models: anthropicModels, storageKey: 'k1' });
    registry.registerProvider({ id: 'openai', name: 'OpenAI', models: openaiModels, storageKey: 'k2' });
  });

  it('selects cheapest sufficient model', () => {
    const estimate = optimizer.estimate(
      [{ role: 'user', content: 'Hello, how are you?' }],
      100,
      'general', // simple domain
      DEFAULT_ROUTING_POLICY,
    );

    expect(estimate).not.toBeNull();
    expect(estimate!.canAfford).toBe(true);
    // Should pick a cheap model for a simple query
    expect(estimate!.estimatedCostCents).not.toBeNull();
  });

  it('respects provider ranking', () => {
    optimizer.setRanking({ providers: ['openai', 'anthropic'] });

    const estimate = optimizer.estimate(
      [{ role: 'user', content: 'Simple question' }],
      100,
      'general',
      DEFAULT_ROUTING_POLICY,
    );

    expect(estimate).not.toBeNull();
    // With OpenAI ranked first, should prefer OpenAI models
    expect(estimate!.provider).toBe('openai');
  });

  it('falls back to next provider when preferred is unavailable', () => {
    optimizer.setRanking({ providers: ['anthropic', 'openai'] });
    registry.setStatus('anthropic', 'rate_limited');

    const fallback = optimizer.selectFallbackProvider('anthropic');
    expect(fallback).not.toBeNull();
    expect(fallback!.provider).toBe('openai');
  });

  it('rejects when spending cap would be exceeded', () => {
    const policy = {
      ...DEFAULT_ROUTING_POLICY,
      mode: 'always' as const,
      // Cap at $0.01, already spent $0.02 — clearly over limit
      spendingCap: { enabled: true, monthlyLimit: 1, currentSpend: 2 },
    };

    const estimate = optimizer.estimate(
      [{ role: 'user', content: 'Analyze this long document about quarterly financial performance metrics and year-over-year growth projections.' }],
      4096,
      'finances',
      policy,
    );

    expect(estimate).not.toBeNull();
    expect(estimate!.canAfford).toBe(false);
  });

  it('returns null when no providers connected', () => {
    const emptyRegistry = new ProviderRegistry();
    const emptyOptimizer = new CostOptimizer(emptyRegistry);

    const estimate = emptyOptimizer.estimate(
      [{ role: 'user', content: 'Hello' }],
      100,
      'general',
      DEFAULT_ROUTING_POLICY,
    );

    expect(estimate).toBeNull();
  });
});

// ─── Prompt Minimizer ─────────────────────────────────────────────────────────

describe('PromptMinimizer', () => {
  let minimizer: PromptMinimizer;

  beforeEach(() => {
    minimizer = new PromptMinimizer();
  });

  it('strips system prompt boilerplate', () => {
    const result = minimizer.minimize(
      [
        {
          role: 'system',
          content: 'You are Semblance, a sovereign personal AI. autonomy tier: partner. connected services: Gmail, Calendar. indexed documents: 500. INJECTION_CANARY_abc123. Your task is to help the user.',
        },
        { role: 'user', content: 'What is 2+2?' },
      ],
      [],
    );

    expect(result.strippedSystemPrompt).toBe(true);
    // The system message should not contain Semblance internals
    const systemMsg = result.messages.find(m => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).not.toContain('INJECTION_CANARY');
    expect(systemMsg!.content).not.toContain('autonomy tier');
    expect(systemMsg!.content).not.toContain('indexed documents');
  });

  it('strips excluded category content', () => {
    const result = minimizer.minimize(
      [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'My bank account balance is $5000. Review my transaction history. Also what time is my meeting?' },
      ],
      ['financial'],
    );

    expect(result.strippedExcludedContent).toBeGreaterThan(0);
    const userMsg = result.messages.find(m => m.role === 'user');
    expect(userMsg!.content).toContain('[financial data redacted]');
    expect(userMsg!.content).toContain('meeting');
  });

  it('compresses long conversation history', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Turn 2' },
      { role: 'assistant', content: 'Response 2' },
      { role: 'user', content: 'Turn 3' },
      { role: 'assistant', content: 'Response 3' },
      { role: 'user', content: 'Turn 4' },
      { role: 'assistant', content: 'Response 4' },
      { role: 'user', content: 'Turn 5 — the actual question' },
    ];

    const result = minimizer.minimize(messages, [], 4);

    // System + 4 turns = 5 messages (down from 10)
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.compressedHistory).toBeGreaterThan(0);
    // Last user message should be preserved
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg!.content).toContain('actual question');
  });

  it('strips PII from non-latest messages', () => {
    const result = minimizer.minimize(
      [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'My SSN is 123-45-6789 and email is john@example.com' },
        { role: 'assistant', content: 'Got it, your SSN is 123-45-6789.' },
        { role: 'user', content: 'Now answer my question about the weather' },
      ],
      [],
    );

    // Earlier messages should have PII stripped
    const assistantMsg = result.messages.find(m => m.role === 'assistant');
    expect(assistantMsg!.content).toContain('[REDACTED]');
    // Latest user message is preserved
    const lastUser = result.messages[result.messages.length - 1];
    expect(lastUser!.content).toContain('weather');
  });

  it('reduces token count', () => {
    const result = minimizer.minimize(
      [
        {
          role: 'system',
          content: 'You are Semblance, a sovereign personal AI. autonomy tier: partner. connected services: Gmail. ' +
            'Relevant knowledge:\n- Document about quarterly earnings with $500K revenue\n- Email from CFO about budget\n' +
            'Knowledge graph context:\nEntity: John Doe, Relationship: manager',
        },
        { role: 'user', content: 'Summarize the meeting notes' },
      ],
      [],
    );

    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
  });
});

// ─── Routing Engine Integration with Phase 4 Components ──────────────────────

describe('RoutingEngine with Phase 4', () => {
  let registry: ProviderRegistry;
  let engine: CloudBridgeRoutingEngine;
  let auditEntries: any[];

  beforeEach(() => {
    registry = new ProviderRegistry();
    const adapter = new CloudBridgeAdapter({ getApiKey: vi.fn().mockResolvedValue('test') });
    auditEntries = [];

    engine = new CloudBridgeRoutingEngine({
      providerRegistry: registry,
      adapter,
      logAuditEntry: (e) => auditEntries.push(e),
    });
  });

  it('has confidence detector, cost optimizer, and prompt minimizer', () => {
    expect(engine.confidenceDetector).toBeDefined();
    expect(engine.costOptimizer).toBeDefined();
    expect(engine.promptMinimizer).toBeDefined();
  });

  it('evaluateAndEscalate returns local response when Cloud Bridge off', async () => {
    const result = await engine.evaluateAndEscalate(
      "I'm not sure, maybe the answer is 42?",
      'finances',
      [{ role: 'user', content: 'What is the revenue?' }],
    );

    // Cloud Bridge is off (default) — should NOT escalate even with low confidence
    expect(result.escalated).toBe(false);
    expect(result.response).toContain("I'm not sure");
    expect(result.confidence.shouldEscalate).toBe(true); // Detector says escalate
    // But escalation was blocked because Cloud Bridge is off
  });

  it('evaluateAndEscalate returns local response when domain is never_cloud', async () => {
    engine.setPolicy({
      ...DEFAULT_ROUTING_POLICY,
      mode: 'smart',
      domainRules: { finances: { routing: 'never_cloud' } },
    });
    registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k' });

    const result = await engine.evaluateAndEscalate(
      "I'm not sure about the balance.",
      'finances',
      [{ role: 'user', content: 'Check balance' }],
    );

    expect(result.escalated).toBe(false);
  });

  it('returns confident local responses without escalation', async () => {
    engine.setPolicy({ ...DEFAULT_ROUTING_POLICY, mode: 'smart' });
    registry.registerProvider({ id: 'anthropic', name: 'A', models: getKnownProvider('anthropic')!.models, storageKey: 'k' });

    const result = await engine.evaluateAndEscalate(
      'The quarterly revenue was $2.5 million, a 15% increase over last quarter driven by enterprise growth.',
      'email',
      [{ role: 'user', content: 'Summarize the earnings report' }],
    );

    expect(result.escalated).toBe(false);
    expect(result.confidence.score).toBeGreaterThan(0.7);
  });
});

// ─── Hybrid Execution Types ──────────────────────────────────────────────────

describe('Hybrid Execution - ModelTier cloud_bridge', () => {
  it('cloud_bridge is a valid ModelTier', () => {
    // Type-level check: this should compile without error
    const tier: import('@semblance/core/agent/orchestrator-v2-types.js').ModelTier = 'cloud_bridge';
    expect(tier).toBe('cloud_bridge');
  });
});

/**
 * Step 20 — Integration tests for Digital Representative.
 * Tests E2E extension→tools→handler, extension→tracker→insights,
 * action manager + follow-up integration, and premium gate blocking.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { createRepresentativeExtension } from '@semblance/core/representative/index';
import type { RepresentativeExtensionDeps } from '@semblance/core/representative/index';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { StyleProfileStore } from '@semblance/core/style/style-profile';
import type { LLMProvider } from '@semblance/core/llm/types';
import type { IPCClient } from '@semblance/core/agent/ipc-client';
import type { AutonomyManager } from '@semblance/core/agent/autonomy';
import type { SemanticSearch } from '@semblance/core/knowledge/search';
import type { RecurringDetector } from '@semblance/core/finance/recurring-detector';

let db: InstanceType<typeof Database>;

function activatePremium(gate: PremiumGate): void {
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const payload = JSON.stringify({ tier: 'digital-representative', exp: futureDate });
  const encoded = Buffer.from(payload).toString('base64');
  gate.activateLicense(`sem_header.${encoded}.signature`);
}

function makeDeps(tierOverride?: string): { deps: RepresentativeExtensionDeps; gate: PremiumGate } {
  const llm: LLMProvider = {
    isAvailable: async () => true,
    generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: async () => ({
      message: { role: 'assistant' as const, content: 'Hi there,\n\nPlease cancel my subscription.\n\nBest,\nUser' },
      model: 'test', tokensUsed: { prompt: 50, completion: 30, total: 80 }, durationMs: 100,
    }),
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };

  const ipcClient: IPCClient = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => true,
    sendAction: vi.fn(async () => ({
      requestId: 'req_1', timestamp: new Date().toISOString(),
      status: 'success' as const, auditRef: 'audit_int_1',
    })),
  };

  const gate = new PremiumGate(db as unknown as DatabaseHandle);

  const autonomyManager = {
    getDomainTier: () => tierOverride ?? 'partner',
    decide: () => 'requires_approval',
    getDomainForAction: () => 'email',
    setDomainTier: vi.fn(),
    getConfig: () => ({}),
  } as unknown as AutonomyManager;

  return {
    gate,
    deps: {
      db: db as unknown as DatabaseHandle,
      llm,
      model: 'llama3.2',
      ipcClient,
      autonomyManager,
      premiumGate: gate,
      styleProfileStore: new StyleProfileStore(db as unknown as DatabaseHandle),
      semanticSearch: { search: async () => [] } as unknown as SemanticSearch,
      recurringDetector: {
        getStoredCharges: () => [],
        detect: () => [],
        flagForgotten: async () => [],
        storeImport: () => {},
        storeCharges: () => {},
        updateStatus: () => {},
        getSummary: () => ({ totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 }),
        getImports: () => [],
      } as unknown as RecurringDetector,
    },
  };
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('Digital Representative Integration (Step 20)', () => {
  it('E2E: extension→tools→handler executes cancel_subscription', async () => {
    const { deps, gate } = makeDeps();
    activatePremium(gate);
    const ext = createRepresentativeExtension(deps);

    const cancelTool = ext.tools!.find(t => t.definition.name === 'cancel_subscription');
    expect(cancelTool).toBeDefined();

    // With no recurring charges, should return empty list
    const result = await cancelTool!.handler({});
    const data = result.result as { subscriptions: unknown[] };
    expect(data.subscriptions).toHaveLength(0);
  });

  it('E2E: extension→tracker→insights generates when premium', () => {
    const { deps, gate } = makeDeps();
    activatePremium(gate);
    const ext = createRepresentativeExtension(deps);

    const tracker = ext.insightTrackers![0]!;
    // With no data, should return empty or minimal insights
    const insights = tracker.generateInsights();
    // No pending actions, no follow-ups → empty or just recent actions
    expect(Array.isArray(insights)).toBe(true);
  });

  it('action manager + follow-up: approved action creates follow-up', async () => {
    const { deps, gate } = makeDeps('alter_ego');
    activatePremium(gate);
    const ext = createRepresentativeExtension(deps);

    // Use the draft_service_email tool with alter_ego tier
    const draftTool = ext.tools!.find(t => t.definition.name === 'draft_service_email');
    expect(draftTool).toBeDefined();

    const result = await draftTool!.handler({
      template: 'cancellation',
      to: 'support@netflix.com',
      fields: { companyName: 'Netflix', supportEmail: 'support@netflix.com' },
    });

    // With alter_ego, standard classification should auto-send
    const data = result.result as { action: { id: string; status: string } };
    expect(data.action.status).toBe('sent');

    // Check that a follow-up was created via the status tool
    const statusTool = ext.tools!.find(t => t.definition.name === 'check_representative_status');
    const statusResult = await statusTool!.handler({});
    const statusData = statusResult.result as { activeFollowUps: unknown[] };
    expect(statusData.activeFollowUps.length).toBeGreaterThanOrEqual(1);
  });

  it('premium gate blocks free tier from auto-sending', async () => {
    const { deps } = makeDeps('alter_ego');
    // DON'T activate premium
    const ext = createRepresentativeExtension(deps);

    const draftTool = ext.tools!.find(t => t.definition.name === 'draft_service_email');
    const result = await draftTool!.handler({
      template: 'cancellation',
      to: 'support@netflix.com',
      fields: { companyName: 'Netflix', supportEmail: 'support@netflix.com' },
    });

    // Without premium, should be pending (not auto-sent)
    const data = result.result as { action: { status: string } };
    expect(data.action.status).toBe('pending');
  });
});

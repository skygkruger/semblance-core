/**
 * Step 20 — Extension initialization tests.
 * Tests createRepresentativeExtension wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRepresentativeExtension } from '@semblance/core/representative/index';
import type { RepresentativeExtensionDeps } from '@semblance/core/representative/index';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { StyleProfileStore } from '@semblance/core/style/style-profile';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import type { LLMProvider } from '@semblance/core/llm/types';
import type { IPCClient } from '@semblance/core/agent/ipc-client';
import type { AutonomyManager } from '@semblance/core/agent/autonomy';
import type { SemanticSearch } from '@semblance/core/knowledge/search';
import type { RecurringDetector } from '@semblance/core/finance/recurring-detector';
import type { MerchantNormalizer } from '@semblance/core/finance/merchant-normalizer';

function makeDeps(): { deps: RepresentativeExtensionDeps; db: InstanceType<typeof Database> } {
  const db = new Database(':memory:');

  const llm: LLMProvider = {
    isAvailable: async () => true,
    generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: async () => ({
      message: { role: 'assistant' as const, content: 'Hello' },
      model: 'test', tokensUsed: { prompt: 10, completion: 5, total: 15 }, durationMs: 50,
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
      status: 'success' as const, auditRef: 'audit_1',
    })),
  };

  const autonomyManager = {
    getDomainTier: () => 'partner',
    decide: () => 'requires_approval',
    getDomainForAction: () => 'email',
    setDomainTier: vi.fn(),
    getConfig: () => ({}),
  } as unknown as AutonomyManager;

  const semanticSearch = {
    search: async () => [],
  } as unknown as SemanticSearch;

  // RecurringDetector needs its own tables
  const recurringDetector = {
    getStoredCharges: () => [],
    detect: () => [],
    flagForgotten: async () => [],
    storeImport: () => {},
    storeCharges: () => {},
    updateStatus: () => {},
    getSummary: () => ({ totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 }),
    getImports: () => [],
  } as unknown as RecurringDetector;

  return {
    db,
    deps: {
      db: db as unknown as DatabaseHandle,
      llm,
      model: 'llama3.2',
      ipcClient,
      autonomyManager,
      premiumGate: new PremiumGate(db as unknown as DatabaseHandle),
      styleProfileStore: new StyleProfileStore(db as unknown as DatabaseHandle),
      semanticSearch,
      recurringDetector,
    },
  };
}

describe('createRepresentativeExtension (Step 20)', () => {
  it('creates extension with correct id and name', () => {
    const { deps, db } = makeDeps();
    const ext = createRepresentativeExtension(deps);
    expect(ext.id).toBe('@semblance/representative');
    expect(ext.name).toBe('Digital Representative');
    expect(ext.version).toBe('1.0.0');
    db.close();
  });

  it('registers 4 tools', () => {
    const { deps, db } = makeDeps();
    const ext = createRepresentativeExtension(deps);
    expect(ext.tools).toHaveLength(4);
    const names = ext.tools!.map(t => t.definition.name);
    expect(names).toContain('cancel_subscription');
    expect(names).toContain('draft_service_email');
    expect(names).toContain('check_representative_status');
    expect(names).toContain('list_pending_actions');
    db.close();
  });

  it('registers 1 insight tracker', () => {
    const { deps, db } = makeDeps();
    const ext = createRepresentativeExtension(deps);
    expect(ext.insightTrackers).toHaveLength(1);
    db.close();
  });

  it('declares correct insight types', () => {
    const { deps, db } = makeDeps();
    const ext = createRepresentativeExtension(deps);
    expect(ext.insightTypes).toContain('follow-up-needed');
    expect(ext.insightTypes).toContain('pending-approval');
    expect(ext.insightTypes).toContain('representative-action-complete');
    db.close();
  });
});

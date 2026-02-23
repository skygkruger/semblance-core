/**
 * Step 20 — CancellationEngine + SupportEmailExtractor tests.
 * Tests 3-tier support extraction, listCancellable mapping, and cancellation workflow.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { SupportEmailExtractor } from '@semblance/core/representative/support-email-extractor';
import { CancellationEngine } from '@semblance/core/representative/cancellation-engine';
import type { KnowledgeProvider, RepresentativeDraft } from '@semblance/core/representative/types';
import type { LLMProvider } from '@semblance/core/llm/types';
import type { RecurringDetector, RecurringCharge } from '@semblance/core/finance/recurring-detector';
import type { RepresentativeEmailDrafter } from '@semblance/core/representative/email-drafter';
import type { SearchResult } from '@semblance/core/knowledge/types';

let db: InstanceType<typeof Database>;

function makeKnowledgeProvider(emailResults: SearchResult[] = []): KnowledgeProvider {
  return {
    searchContext: async () => [],
    searchEmails: async () => emailResults,
  };
}

function makeLLM(jsonResponse: string = '{"email":"unknown"}'): LLMProvider {
  return {
    isAvailable: async () => true,
    generate: async () => ({ text: '', model: 'test', tokensUsed: { prompt: 0, completion: 0, total: 0 }, durationMs: 0 }),
    chat: async () => ({
      message: { role: 'assistant' as const, content: jsonResponse },
      model: 'test',
      tokensUsed: { prompt: 50, completion: 30, total: 80 },
      durationMs: 100,
    }),
    embed: async () => ({ embeddings: [[]], model: 'test', durationMs: 0 }),
    listModels: async () => [],
    getModel: async () => null,
  };
}

function makeCharge(overrides?: Partial<RecurringCharge>): RecurringCharge {
  return {
    id: 'ch_1',
    merchantName: 'Netflix',
    amount: -1599,
    frequency: 'monthly',
    confidence: 0.9,
    lastChargeDate: '2026-02-01',
    chargeCount: 6,
    estimatedAnnualCost: 19188,
    transactions: [],
    status: 'active',
    ...overrides,
  };
}

function makeRecurringDetector(charges: RecurringCharge[]): RecurringDetector {
  return {
    getStoredCharges: () => charges,
    detect: () => [],
    flagForgotten: async () => [],
    storeImport: () => {},
    storeCharges: () => {},
    updateStatus: () => {},
    getSummary: () => ({ totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 }),
    getImports: () => [],
  } as unknown as RecurringDetector;
}

function makeDrafter(draft?: Partial<RepresentativeDraft>): RepresentativeEmailDrafter {
  return {
    draftEmail: async () => ({
      to: 'support@netflix.com',
      subject: 'Cancel Subscription — Netflix',
      body: 'Please cancel my subscription.',
      draftType: 'cancellation' as const,
      styleScore: null,
      attempts: 1,
      ...draft,
    }),
  } as unknown as RepresentativeEmailDrafter;
}

beforeEach(() => {
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
});

describe('SupportEmailExtractor (Step 20)', () => {
  it('returns known database contact for recognized merchants', async () => {
    const extractor = new SupportEmailExtractor({
      knowledgeProvider: makeKnowledgeProvider(),
      llm: makeLLM(),
      model: 'test',
    });

    const contact = await extractor.extract('Netflix');
    expect(contact.source).toBe('known-database');
    expect(contact.email).toBe('support@netflix.com');
    expect(contact.cancellationUrl).toContain('netflix.com');
  });

  it('falls back to email history when merchant is unknown', async () => {
    const emailResults: SearchResult[] = [{
      chunk: {
        id: 'c1', documentId: 'd1',
        content: 'Contact us at billing@acme-saas.com to manage your subscription.',
        chunkIndex: 0, metadata: {},
      },
      document: {
        id: 'd1', source: 'email', title: 'Acme Billing', content: '',
        contentHash: '', mimeType: 'text/plain',
        createdAt: '', updatedAt: '', indexedAt: '', metadata: {},
      },
      score: 0.7,
    }];

    const extractor = new SupportEmailExtractor({
      knowledgeProvider: makeKnowledgeProvider(emailResults),
      llm: makeLLM(),
      model: 'test',
    });

    const contact = await extractor.extract('Acme SaaS Pro');
    expect(contact.source).toBe('email-history');
    expect(contact.email).toBe('billing@acme-saas.com');
  });

  it('returns not-found when no method works', async () => {
    const extractor = new SupportEmailExtractor({
      knowledgeProvider: makeKnowledgeProvider(),
      llm: makeLLM('{"email":"unknown"}'),
      model: 'test',
    });

    const contact = await extractor.extract('SuperObscureService12345');
    expect(contact.source).toBe('not-found');
    expect(contact.method).toBe('unknown');
  });
});

describe('CancellationEngine (Step 20)', () => {
  it('listCancellable maps RecurringCharge to CancellableSubscription', async () => {
    const charges = [makeCharge()];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM(),
        model: 'test',
      }),
    });

    const subs = await engine.listCancellable();
    expect(subs).toHaveLength(1);
    expect(subs[0]!.merchantName).toBe('Netflix');
    expect(subs[0]!.chargeId).toBe('ch_1');
  });

  it('listCancellable enriches with support email from known database', async () => {
    const charges = [makeCharge({ merchantName: 'Spotify' })];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM(),
        model: 'test',
      }),
    });

    const subs = await engine.listCancellable();
    expect(subs[0]!.supportContact).not.toBeNull();
    expect(subs[0]!.supportContact!.email).toBe('support@spotify.com');
  });

  it('listCancellable handles missing support email gracefully', async () => {
    const charges = [makeCharge({ merchantName: 'TotallyUnknownCorp999' })];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM('{"email":"unknown"}'),
        model: 'test',
      }),
    });

    const subs = await engine.listCancellable();
    expect(subs[0]!.supportContact).toBeNull();
  });

  it('listCancellable handles charges with no cancellation URL', async () => {
    const charges = [makeCharge({ merchantName: 'HBO Max' })];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM(),
        model: 'test',
      }),
    });

    const subs = await engine.listCancellable();
    expect(subs[0]!.supportContact!.email).toBe('support@hbomax.com');
    expect(subs[0]!.supportContact!.cancellationUrl).toBeUndefined();
  });

  it('initiateCancellation drafts a cancellation email', async () => {
    const charges = [makeCharge()];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM(),
        model: 'test',
      }),
    });

    const draft = await engine.initiateCancellation('ch_1');
    expect(draft).not.toBeNull();
    expect(draft!.draftType).toBe('cancellation');
    expect(draft!.body).toContain('cancel');
  });

  it('initiateCancellation sets status to draft-ready', async () => {
    const charges = [makeCharge()];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM(),
        model: 'test',
      }),
    });

    await engine.initiateCancellation('ch_1');
    const status = engine.getCancellationStatus('ch_1');
    expect(status).toBe('draft-ready');
  });

  it('updateCancellationStatus persists new status', async () => {
    const charges = [makeCharge()];
    const engine = new CancellationEngine({
      db: db as unknown as DatabaseHandle,
      recurringDetector: makeRecurringDetector(charges),
      emailDrafter: makeDrafter(),
      supportExtractor: new SupportEmailExtractor({
        knowledgeProvider: makeKnowledgeProvider(),
        llm: makeLLM(),
        model: 'test',
      }),
    });

    // Create a cancellation first
    await engine.initiateCancellation('ch_1');

    engine.updateCancellationStatus('ch_1', 'sent');
    expect(engine.getCancellationStatus('ch_1')).toBe('sent');

    engine.updateCancellationStatus('ch_1', 'confirmed');
    expect(engine.getCancellationStatus('ch_1')).toBe('confirmed');
  });
});

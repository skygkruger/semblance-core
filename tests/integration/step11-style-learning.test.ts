// Step 11 Integration Tests — Style Learning end-to-end flows.
//
// Tests the full pipeline: email extraction → profile building → style-matched drafting →
// scoring → correction tracking → profile learning.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { StyleProfileStore, createEmptyProfile, type StyleProfile } from '@semblance/core/style/style-profile.js';
import { extractStyleFromEmails, updateProfileWithNewEmails, type SentEmail } from '@semblance/core/style/style-extractor.js';
import { buildStylePrompt, buildInactiveStylePrompt, buildRetryPrompt } from '@semblance/core/style/style-injector.js';
import { scoreDraft, type StyleScore } from '@semblance/core/style/style-scorer.js';
import { StyleExtractionJob, type SentEmailQuery } from '@semblance/core/style/style-extraction-job.js';
import { classifyCorrection, applyCorrections } from '@semblance/core/style/style-correction-processor.js';
import type { LLMProvider, ChatResponse } from '@semblance/core/llm/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMockLLM(toneOverrides?: Record<string, unknown>): LLMProvider {
  const defaultTone = {
    formality: 45,
    directness: 70,
    warmth: 65,
    commonPhrases: ['sounds good', 'let me know', 'quick question'],
  };
  const contextClassification = {
    classifications: [
      { index: 1, context: 'colleague' },
      { index: 2, context: 'colleague' },
      { index: 3, context: 'friend' },
    ],
  };

  let callCount = 0;
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockImplementation(() => {
      callCount++;
      const content = callCount % 2 === 1
        ? JSON.stringify({ ...defaultTone, ...toneOverrides })
        : JSON.stringify(contextClassification);
      return Promise.resolve({
        message: { role: 'assistant', content },
        model: 'test-model',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      } satisfies ChatResponse);
    }),
    embed: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

/** Generate realistic casual sent emails */
function generateCasualEmails(count: number): SentEmail[] {
  const bodies = [
    "Hey Sarah,\n\nSounds good! I'll send over the files later today. Let me know if you need anything else.\n\nCheers,\nAlex",
    "Hi Mike,\n\nQuick question — did you get a chance to review the proposal? I'd like to finalize it by Friday.\n\nThanks,\nAlex",
    "Hey team,\n\nHere are the notes from today's standup:\n\n- Feature A is on track\n- Bug B needs review\n- Sprint ends Friday\n\nLet me know if I missed anything!\n\nCheers,\nAlex",
    "Hi Lisa,\n\nI've finished the first draft. Can you take a look when you get a chance? No rush.\n\nThanks,\nAlex",
    "Hey Bob,\n\nGreat call today! I think we're on the right track. I'll follow up with the client tomorrow.\n\nCheers,\nAlex",
    "Hi Sam,\n\nJust checking in on the design mockups. Are they ready for the review on Thursday?\n\nThanks,\nAlex",
    "Hey Rachel,\n\nSounds good! Let me know if the timeline works for your team.\n\nCheers,\nAlex",
    "Hi Dan,\n\nI've updated the project plan with the new milestones. Let me know if anything looks off.\n\nThanks,\nAlex",
    "Hey Chris,\n\nQuick update — the deployment went smoothly. No issues so far.\n\nCheers,\nAlex",
    "Hi Team,\n\nReminder: quarterly review is next Monday. Please have your slides ready by Friday.\n\nThanks,\nAlex",
  ];

  const emails: SentEmail[] = [];
  for (let i = 0; i < count; i++) {
    emails.push({
      id: `e2e_${i}`,
      from: 'alex@example.com',
      to: [`recipient${i}@example.com`],
      subject: `Subject ${i}`,
      body: bodies[i % bodies.length],
      date: new Date(2026, 1, 20, 10, i).toISOString(),
    });
  }
  return emails;
}

let db: Database.Database;
let store: StyleProfileStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new StyleProfileStore(db);
});

// ─── End-to-End Tests ─────────────────────────────────────────────────────────

describe('End-to-end: 25 emails → active profile → styled draft', () => {
  it('creates active profile from 25 emails and generates styled draft with score', async () => {
    const emails = generateCasualEmails(25);
    const llm = makeMockLLM();

    // Step 1: Extract style from 25 emails
    const profile = await extractStyleFromEmails(emails, llm, 'test-model');

    expect(profile.emailsAnalyzed).toBe(25);
    expect(profile.isActive).toBe(true);

    // Step 2: Persist profile
    const created = store.createProfile(profile);
    expect(store.isProfileActive(created.id)).toBe(true);

    // Step 3: Build style prompt — should include style instructions
    const prompt = buildStylePrompt(created, {
      isReply: false,
      subject: 'Quick question',
      recipientEmail: 'bob@example.com',
    });
    // Prompt should reference greeting and signoff patterns from the profile
    expect(prompt).toContain('open with');
    expect(prompt).toContain('sign off');

    // Step 4: Score a well-matched draft
    const draft = "Hey Bob,\n\nQuick question about the timeline. Let me know when you're free to chat.\n\nCheers,\nAlex";
    const score = scoreDraft(draft, created);

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(score.breakdown.greeting).toBeDefined();
    expect(score.breakdown.signoff).toBeDefined();
    expect(score.breakdown.sentenceLength).toBeDefined();
    expect(score.breakdown.formality).toBeDefined();
    expect(score.breakdown.vocabulary).toBeDefined();
  });
});

describe('End-to-end: 15 emails → inactive profile → generic prompt', () => {
  it('creates inactive profile from 15 emails and uses generic prompt', async () => {
    const emails = generateCasualEmails(15);
    const llm = makeMockLLM();

    // Step 1: Extract style from 15 emails (below 20 threshold)
    const profile = await extractStyleFromEmails(emails, llm, 'test-model');

    expect(profile.emailsAnalyzed).toBe(15);
    expect(profile.isActive).toBe(false);

    // Step 2: Persist profile
    const created = store.createProfile(profile);
    expect(store.isProfileActive(created.id)).toBe(false);

    // Step 3: Build inactive style prompt
    const prompt = buildInactiveStylePrompt();
    expect(prompt).toContain('professional');
    // Should NOT contain specific style patterns
    expect(prompt).not.toContain('Greeting pattern');
    expect(prompt).not.toContain('Hey');
  });
});

describe('End-to-end: Background extraction job pipeline', () => {
  it('processes emails in batches and creates active profile', async () => {
    const emails = generateCasualEmails(25);
    const llm = makeMockLLM();

    const query: SentEmailQuery = {
      getSentEmails(_userEmail: string, options?: { since?: string; limit?: number; offset?: number }): SentEmail[] {
        let result = emails;
        if (options?.offset !== undefined) result = result.slice(options.offset);
        if (options?.limit !== undefined) result = result.slice(0, options.limit);
        return result;
      },
      getSentEmailCount: () => emails.length,
    };

    const job = new StyleExtractionJob({
      profileStore: store,
      llm,
      model: 'test-model',
      userEmail: 'alex@example.com',
      batchSize: 10,
    });

    const result = await job.runInitialExtraction(query);
    expect(result).not.toBeNull();

    // Profile should be persisted and active
    const stored = store.getActiveProfile();
    expect(stored).not.toBeNull();
    expect(stored!.emailsAnalyzed).toBeGreaterThanOrEqual(25);
  });
});

describe('Correction loop: draft → edit → correction → profile update', () => {
  it('tracks corrections and updates profile after 3+ of same type', async () => {
    // Setup: create active profile
    const emails = generateCasualEmails(25);
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(emails, llm, 'test-model');
    const created = store.createProfile(profile);
    const profileId = created.id;

    // Step 1: Simulate 3 greeting corrections (user changes "Hi" to "Hello")
    const corrections = [
      { orig: 'Hi Sarah,\n\nContent.\n\nCheers,\nAlex', corr: 'Hello Sarah,\n\nContent.\n\nCheers,\nAlex' },
      { orig: 'Hi Mike,\n\nOther content.\n\nCheers,\nAlex', corr: 'Hello Mike,\n\nOther content.\n\nCheers,\nAlex' },
      { orig: 'Hi Bob,\n\nMore content.\n\nCheers,\nAlex', corr: 'Hello Bob,\n\nMore content.\n\nCheers,\nAlex' },
    ];

    for (const c of corrections) {
      const classification = await classifyCorrection(c.orig, c.corr);
      expect(classification.type).toBe('greeting');

      store.addCorrection({
        profileId,
        originalDraft: c.orig,
        correctedDraft: c.corr,
        correctionType: classification.type,
      });
    }

    // Step 2: Verify corrections are stored
    const unapplied = store.getUnappliedCorrections(profileId);
    expect(unapplied).toHaveLength(3);

    // Step 3: Apply corrections
    const result = applyCorrections(store, profileId);
    expect(result.applied).toBe(true);
    expect(result.profileUpdated).toBe(true);
    expect(result.changes).toContain('Updated greeting patterns from corrections');

    // Step 4: Verify profile now includes "Hello"
    const updated = store.getProfileById(profileId);
    expect(updated).not.toBeNull();
    const helloPattern = updated!.greetings.patterns.find(p => p.text === 'Hello');
    expect(helloPattern).toBeDefined();
  });

  it('does not apply corrections when fewer than 3 of same type', async () => {
    const emails = generateCasualEmails(25);
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(emails, llm, 'test-model');
    const created = store.createProfile(profile);
    const profileId = created.id;

    // Only 2 corrections — should NOT trigger profile update
    store.addCorrection({
      profileId,
      originalDraft: 'Hi Sarah,\n\nContent.\n\nBest,\nAlex',
      correctedDraft: 'Hello Sarah,\n\nContent.\n\nBest,\nAlex',
      correctionType: 'greeting',
    });
    store.addCorrection({
      profileId,
      originalDraft: 'Hi Bob,\n\nContent.\n\nBest,\nAlex',
      correctedDraft: 'Hello Bob,\n\nContent.\n\nBest,\nAlex',
      correctionType: 'greeting',
    });

    const result = applyCorrections(store, profileId);
    expect(result.applied).toBe(false);
    expect(result.profileUpdated).toBe(false);
  });
});

describe('A/B comparison: styled vs unstyled draft', () => {
  it('style prompt is substantively different from inactive prompt', async () => {
    const emails = generateCasualEmails(30);
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(emails, llm, 'test-model');
    profile.isActive = true;
    const created = store.createProfile(profile);

    const styledPrompt = buildStylePrompt(created, {
      isReply: false,
      subject: 'Test email',
    });

    const genericPrompt = buildInactiveStylePrompt();

    // Styled prompt should be longer (contains specific patterns)
    expect(styledPrompt.length).toBeGreaterThan(genericPrompt.length);

    // Styled prompt should contain profile-specific content
    expect(styledPrompt).toContain('open with');
    expect(styledPrompt).toContain('sign off');

    // Generic prompt should NOT contain specific greeting/signoff patterns
    expect(genericPrompt).not.toContain('Hey');
    expect(genericPrompt).not.toContain('Cheers');
  });
});

describe('Retry prompt includes weak dimension feedback', () => {
  it('buildRetryPrompt produces targeted feedback for low-scoring dimensions', () => {
    const profile = createEmptyProfile();
    profile.emailsAnalyzed = 50;
    profile.isActive = true;
    profile.greetings.patterns = [{ text: 'Hi', frequency: 1.0, contexts: [] }];
    profile.signoffs.patterns = [{ text: 'Best', frequency: 1.0, contexts: [] }];

    const weakDimensions = [
      { name: 'greeting', score: 20 },
      { name: 'vocabulary', score: 40 },
      { name: 'signoff', score: 100 },
    ];

    const retryPrompt = buildRetryPrompt(weakDimensions, profile);
    expect(retryPrompt).not.toBeNull();
    expect(retryPrompt!.length).toBeGreaterThan(0);
    // Should reference the weak dimension (greeting)
    expect(retryPrompt).toContain('greeting');
  });
});

describe('Regression: existing email tests unaffected', () => {
  it('style system imports do not break without style profile store', () => {
    // Verify that the orchestrator can be constructed without a style profile store
    // (backwards compatibility — the styleProfileStore is optional)
    // This is verified by the fact that orchestrator-email.test.ts passes,
    // but we do an explicit import check here.
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const orchPath = join(import.meta.dirname, '..', '..', 'packages', 'core', 'agent', 'orchestrator.ts');
    const content = readFileSync(orchPath, 'utf-8');

    // styleProfileStore should be optional in config
    expect(content).toContain('styleProfileStore?:');
    // Default to null if not provided
    expect(content).toContain('config.styleProfileStore ?? null');
  });
});

describe('Style profile versioning through corrections', () => {
  it('profile version increments on each correction application', async () => {
    const emails = generateCasualEmails(25);
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(emails, llm, 'test-model');
    const created = store.createProfile(profile);
    const initialVersion = created.version;

    // Add 3 greeting corrections
    for (let i = 0; i < 3; i++) {
      store.addCorrection({
        profileId: created.id,
        originalDraft: 'Hi Person,\n\nContent.\n\nBest,\nAlex',
        correctedDraft: 'Hello Person,\n\nContent.\n\nBest,\nAlex',
        correctionType: 'greeting',
      });
    }

    applyCorrections(store, created.id);

    const updated = store.getProfileById(created.id);
    expect(updated!.version).toBeGreaterThan(initialVersion);

    // History should have the previous version
    const history = store.getProfileHistory(created.id);
    expect(history.length).toBeGreaterThan(0);
  });
});

// Tests for Style Correction Processor — classification, application, feedback loop.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  classifyCorrection,
  classifyCorrectionHeuristic,
  applyCorrections,
  type CorrectionClassification,
} from '@semblance/core/style/style-correction-processor.js';
import { StyleProfileStore, createEmptyProfile, type StyleProfile } from '@semblance/core/style/style-profile.js';
import type { LLMProvider, ChatResponse } from '@semblance/core/llm/types.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMockLLM(responseType: string = 'tone'): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockResolvedValue({
      message: {
        role: 'assistant',
        content: JSON.stringify({ type: responseType, reason: 'LLM classified' }),
      },
      model: 'test',
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 200,
    } satisfies ChatResponse),
    embed: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

function makeTestProfile(): StyleProfile {
  const profile = createEmptyProfile();
  profile.id = 'sp_test';
  profile.emailsAnalyzed = 50;
  profile.isActive = true;
  profile.greetings = {
    patterns: [
      { text: 'Hi', frequency: 0.7, contexts: [] },
      { text: 'Hey', frequency: 0.3, contexts: [] },
    ],
    usesRecipientName: true,
    usesNameVariant: 'first',
  };
  profile.signoffs = {
    patterns: [
      { text: 'Best', frequency: 0.6, contexts: [] },
      { text: 'Thanks', frequency: 0.4, contexts: [] },
    ],
    includesName: true,
  };
  profile.tone = { formalityScore: 55, directnessScore: 70, warmthScore: 60 };
  profile.vocabulary = {
    commonPhrases: ['sounds good', 'let me know'],
    avoidedWords: [],
    usesContractions: true,
    contractionRate: 0.75,
    usesEmoji: false,
    emojiFrequency: 0,
    commonEmoji: [],
    usesExclamation: true,
    exclamationRate: 0.12,
  };
  profile.structure = {
    avgSentenceLength: 12,
    avgParagraphLength: 2,
    avgEmailLength: 80,
    usesListsOrBullets: false,
    listFrequency: 0,
  };
  profile.contextVariations = [];
  return profile;
}

let db: Database.Database;
let store: StyleProfileStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new StyleProfileStore(db as unknown as DatabaseHandle);
});

// ─── Classification Tests ─────────────────────────────────────────────────────

describe('classifyCorrectionHeuristic', () => {
  it('detects greeting change', () => {
    const original = 'Hi Sarah,\n\nHere is the report you asked for.\n\nBest,\nAlex';
    const corrected = 'Hey Sarah,\n\nHere is the report you asked for.\n\nBest,\nAlex';

    const result = classifyCorrectionHeuristic(original, corrected);
    expect(result.type).toBe('greeting');
    expect(result.confidence).toBe('high');
  });

  it('detects signoff change', () => {
    const original = 'Hi Sarah,\n\nHere is the report.\n\nBest,\nAlex';
    const corrected = 'Hi Sarah,\n\nHere is the report.\n\nCheers,\nAlex';

    const result = classifyCorrectionHeuristic(original, corrected);
    expect(result.type).toBe('signoff');
    expect(result.confidence).toBe('high');
  });

  it('detects vocabulary change (contractions added)', () => {
    const original = 'Hi Bob,\n\nI have finished the work and I will send it. I do not think it will take long.\n\nBest,\nAlex';
    const corrected = "Hi Bob,\n\nI've finished the work and I'll send it. I don't think it'll take long.\n\nBest,\nAlex";

    const result = classifyCorrectionHeuristic(original, corrected);
    expect(result.type).toBe('vocabulary');
    expect(result.confidence).toBe('high');
  });

  it('detects structure change (paragraphs added)', () => {
    const original = 'Hi Bob,\n\nThe project is done. The deadline was met. The client is happy. We should celebrate.\n\nBest,\nAlex';
    const corrected = 'Hi Bob,\n\nThe project is done. The deadline was met.\n\nThe client is happy.\n\nWe should celebrate.\n\nBest,\nAlex';

    const result = classifyCorrectionHeuristic(original, corrected);
    expect(result.type).toBe('structure');
    expect(result.confidence).toBe('high');
  });

  it('returns low confidence for ambiguous changes', () => {
    const original = 'Hi Bob,\n\nLet me know about the project.\n\nBest,\nAlex';
    const corrected = 'Hi Bob,\n\nCould you update me on the project status?\n\nBest,\nAlex';

    const result = classifyCorrectionHeuristic(original, corrected);
    expect(result.confidence).toBe('low');
  });
});

describe('classifyCorrection (with LLM)', () => {
  it('uses LLM for low-confidence heuristic results', async () => {
    const original = 'Hi Bob,\n\nLet me know about the project.\n\nBest,\nAlex';
    const corrected = 'Hi Bob,\n\nCould you update me on the project status?\n\nBest,\nAlex';

    const llm = makeMockLLM('tone');
    const result = await classifyCorrection(original, corrected, llm, 'test-model');

    expect(result.type).toBe('tone');
    expect(result.confidence).toBe('high');
    expect(llm.chat).toHaveBeenCalled();
  });

  it('skips LLM for high-confidence heuristic results', async () => {
    const original = 'Hi Sarah,\n\nContent here.\n\nBest,\nAlex';
    const corrected = 'Hey Sarah,\n\nContent here.\n\nBest,\nAlex';

    const llm = makeMockLLM('greeting');
    const result = await classifyCorrection(original, corrected, llm, 'test-model');

    expect(result.type).toBe('greeting');
    expect(llm.chat).not.toHaveBeenCalled();
  });
});

// ─── Correction Application Tests ─────────────────────────────────────────────

describe('applyCorrections', () => {
  it('applies greeting corrections after 3+ same-type', () => {
    const profile = makeTestProfile();
    const created = store.createProfile(profile);
    const profileId = created.id;

    // Add 3 greeting corrections: user keeps changing "Hi" to "Hello"
    store.addCorrection({
      profileId,
      originalDraft: 'Hi Sarah,\n\nContent.\n\nBest,\nAlex',
      correctedDraft: 'Hello Sarah,\n\nContent.\n\nBest,\nAlex',
      correctionType: 'greeting',
    });
    store.addCorrection({
      profileId,
      originalDraft: 'Hi Bob,\n\nAnother email.\n\nBest,\nAlex',
      correctedDraft: 'Hello Bob,\n\nAnother email.\n\nBest,\nAlex',
      correctionType: 'greeting',
    });
    store.addCorrection({
      profileId,
      originalDraft: 'Hi Team,\n\nMeeting notes.\n\nBest,\nAlex',
      correctedDraft: 'Hello Team,\n\nMeeting notes.\n\nBest,\nAlex',
      correctionType: 'greeting',
    });

    const result = applyCorrections(store, profileId);

    expect(result.applied).toBe(true);
    expect(result.correctionsApplied).toBe(3);
    expect(result.profileUpdated).toBe(true);
    expect(result.changes).toContain('Updated greeting patterns from corrections');

    // Profile should now include "Hello" as a greeting pattern
    const updated = store.getProfileById(profileId);
    expect(updated).not.toBeNull();
    const helloPattern = updated!.greetings.patterns.find(p => p.text === 'Hello');
    expect(helloPattern).toBeDefined();
    expect(helloPattern!.frequency).toBeGreaterThan(0);
  });

  it('does NOT apply corrections when fewer than 3 of same type', () => {
    const profile = makeTestProfile();
    const created = store.createProfile(profile);
    const profileId = created.id;

    // Add only 2 greeting corrections
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
    expect(result.correctionsApplied).toBe(0);
    expect(result.profileUpdated).toBe(false);
  });

  it('applies vocabulary corrections (contraction rate increase)', () => {
    const profile = makeTestProfile();
    profile.vocabulary.contractionRate = 0.3;
    profile.vocabulary.usesContractions = true;
    const created = store.createProfile(profile);
    const profileId = created.id;

    // 3 corrections where user adds contractions
    for (let i = 0; i < 3; i++) {
      store.addCorrection({
        profileId,
        originalDraft: `Hi Bob,\n\nI have finished and I will send it. I do not think it is a problem.\n\nBest,\nAlex`,
        correctedDraft: `Hi Bob,\n\nI've finished and I'll send it. I don't think it's a problem.\n\nBest,\nAlex`,
        correctionType: 'vocabulary',
      });
    }

    const result = applyCorrections(store, profileId);

    expect(result.applied).toBe(true);
    expect(result.profileUpdated).toBe(true);

    const updated = store.getProfileById(profileId);
    expect(updated!.vocabulary.contractionRate).toBeGreaterThan(0.3);
  });

  it('marks corrections as applied after processing', () => {
    const profile = makeTestProfile();
    const created = store.createProfile(profile);
    const profileId = created.id;

    for (let i = 0; i < 3; i++) {
      store.addCorrection({
        profileId,
        originalDraft: 'Hi Sarah,\n\nContent.\n\nBest,\nAlex',
        correctedDraft: 'Hello Sarah,\n\nContent.\n\nBest,\nAlex',
        correctionType: 'greeting',
      });
    }

    applyCorrections(store, profileId);

    // All corrections should be marked as applied
    const unapplied = store.getUnappliedCorrections(profileId);
    expect(unapplied).toHaveLength(0);
  });

  it('handles mixed correction types independently', () => {
    const profile = makeTestProfile();
    const created = store.createProfile(profile);
    const profileId = created.id;

    // 3 greeting corrections (should apply)
    for (let i = 0; i < 3; i++) {
      store.addCorrection({
        profileId,
        originalDraft: 'Hi,\n\nContent.\n\nBest,\nAlex',
        correctedDraft: 'Hello,\n\nContent.\n\nBest,\nAlex',
        correctionType: 'greeting',
      });
    }

    // 2 signoff corrections (should NOT apply — only 2)
    for (let i = 0; i < 2; i++) {
      store.addCorrection({
        profileId,
        originalDraft: 'Hi,\n\nContent.\n\nBest,\nAlex',
        correctedDraft: 'Hi,\n\nContent.\n\nCheers,\nAlex',
        correctionType: 'signoff',
      });
    }

    const result = applyCorrections(store, profileId);

    expect(result.applied).toBe(true);
    expect(result.correctionsApplied).toBe(3); // Only greeting corrections applied
    expect(result.changes).toContain('Updated greeting patterns from corrections');
    expect(result.changes).not.toContain('Updated sign-off patterns from corrections');

    // Signoff corrections should still be unapplied
    const unapplied = store.getUnappliedCorrections(profileId);
    expect(unapplied).toHaveLength(2);
  });

  it('returns empty result when profile does not exist', () => {
    const result = applyCorrections(store, 'nonexistent');
    expect(result.applied).toBe(false);
    expect(result.correctionsApplied).toBe(0);
  });
});

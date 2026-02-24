// Style Match Verification Tests — Validates that StyleProfile scoring works
// correctly for Alter Ego drafting quality assurance.

import { describe, it, expect } from 'vitest';
import { scoreDraft, type StyleScore } from '../../../packages/core/style/style-scorer.js';
import type { StyleProfile } from '../../../packages/core/style/style-profile.js';

function createTestProfile(overrides?: Partial<StyleProfile>): StyleProfile {
  return {
    id: 'sp-test',
    version: 1,
    emailsAnalyzed: 50,
    isActive: true,
    lastUpdatedAt: new Date().toISOString(),
    greetings: {
      patterns: [{ text: 'Hi', frequency: 0.8, contexts: ['casual'] }],
      usesRecipientName: true,
      usesNameVariant: 'first',
    },
    signoffs: {
      patterns: [{ text: 'Best', frequency: 0.7, contexts: ['default'] }],
      includesName: false,
    },
    tone: {
      formalityScore: 40,
      directnessScore: 70,
      warmthScore: 60,
    },
    structure: {
      avgSentenceLength: 15,
      avgParagraphLength: 3,
      avgEmailLength: 50,
      usesListsOrBullets: false,
      listFrequency: 0,
    },
    vocabulary: {
      commonPhrases: ['sounds good', 'let me know'],
      avoidedWords: [],
      usesContractions: true,
      contractionRate: 0.6,
      usesEmoji: false,
      emojiFrequency: 0,
      commonEmoji: [],
      usesExclamation: true,
      exclamationRate: 0.2,
    },
    contextVariations: [],
    ...overrides,
  };
}

describe('Style Match Verification', () => {
  const profile = createTestProfile();

  it('draft matching profile scores overall >= 80', () => {
    // Draft that matches: "Hi" greeting, "Best" signoff, contractions, ~15 word sentences
    const draft = `Hi Sarah,

I wanted to check in about the project. I don't think we need to rush on this one. Let me know if you have any questions about it!

Best,
Alex`;

    const score = scoreDraft(draft, profile);
    expect(score.overall).toBeGreaterThanOrEqual(80);
  });

  it('5 email scenarios all score 80+ for matching profile', () => {
    const scenarios = [
      // Formal reply
      `Hi Mark,

Thanks for sending that over. I'll review it today and get back to you. Let me know if there's anything urgent!

Best,
Alex`,
      // Casual
      `Hi team,

Quick update — I've finished the review. Everything looks good to me. I don't see any issues!

Best`,
      // Short
      `Hi,

Sounds good, I'll take care of it. Let me know if anything changes!

Best`,
      // With list reference but inline
      `Hi Dana,

I've reviewed the items you mentioned. I think we should prioritize the first two. I don't think the third one is urgent right now!

Best`,
      // With exclamation
      `Hi everyone,

Great news! I've wrapped up the analysis. I don't think we'll need extra time. Let me know your thoughts!

Best`,
    ];

    for (const draft of scenarios) {
      const score = scoreDraft(draft, profile);
      expect(score.overall).toBeGreaterThanOrEqual(80);
    }
  });

  it('unstyled draft scores measurably lower than styled draft', () => {
    const styledDraft = `Hi Sarah,

I wanted to check in about the project. I don't think we need to rush on this. Let me know your thoughts!

Best`;

    // Unstyled: formal greeting, formal signoff, no contractions, long sentences
    const unstyledDraft = `Dear Mrs. Johnson,

I am writing to formally inquire about the status of the aforementioned project deliverables that were discussed in our previous correspondence. I would appreciate it if you could provide an update at your earliest convenience regarding the timeline and any potential obstacles that may have arisen since our last communication.

Sincerely yours,
Alexander Thompson III`;

    const styledScore = scoreDraft(styledDraft, profile);
    const unstyledScore = scoreDraft(unstyledDraft, profile);

    expect(styledScore.overall).toBeGreaterThan(unstyledScore.overall);
  });

  it('empty profile gives baseline scores (not errors)', () => {
    const emptyProfile = createTestProfile({
      greetings: { patterns: [], usesRecipientName: false, usesNameVariant: 'none' },
      signoffs: { patterns: [], includesName: false },
      structure: { avgSentenceLength: 0, avgParagraphLength: 0, avgEmailLength: 0, usesListsOrBullets: false, listFrequency: 0 },
    });

    const draft = 'Hello, this is a test message.';
    const score = scoreDraft(draft, emptyProfile);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    // Should not throw
  });
});

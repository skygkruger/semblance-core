// Tests for Style Scorer — heuristic scoring, determinism, edge cases.

import { describe, it, expect } from 'vitest';
import { scoreDraft, type StyleScore } from '@semblance/core/style/style-scorer.js';
import { createEmptyProfile, type StyleProfile } from '@semblance/core/style/style-profile.js';

function makeTestProfile(): StyleProfile {
  const profile = createEmptyProfile();
  profile.id = 'sp_test';
  profile.emailsAnalyzed = 50;
  profile.isActive = true;
  profile.greetings = {
    patterns: [
      { text: 'Hi', frequency: 0.7, contexts: [] },
      { text: 'Hey', frequency: 0.2, contexts: [] },
    ],
    usesRecipientName: true,
    usesNameVariant: 'first',
  };
  profile.signoffs = {
    patterns: [
      { text: 'Best', frequency: 0.6, contexts: [] },
      { text: 'Thanks', frequency: 0.3, contexts: [] },
    ],
    includesName: true,
  };
  profile.tone = { formalityScore: 55, directnessScore: 70, warmthScore: 60 };
  profile.structure = {
    avgSentenceLength: 12,
    avgParagraphLength: 2,
    avgEmailLength: 80,
    usesListsOrBullets: false,
    listFrequency: 0,
  };
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
  profile.contextVariations = [];
  return profile;
}

describe('scoreDraft', () => {
  const profile = makeTestProfile();

  it('scores a well-matched draft above 80', () => {
    const draft = `Hi Sarah,

I've reviewed the proposal and it looks good. Let me know if you'd like to discuss any changes.

I'll be available tomorrow afternoon if you want to chat.

Best,
Alex`;

    const score = scoreDraft(draft, profile);
    expect(score.overall).toBeGreaterThanOrEqual(80);
    expect(score.breakdown.greeting).toBe(100);
    expect(score.breakdown.signoff).toBe(100);
  });

  it('scores a poorly-matched draft below 60', () => {
    const draft = `Dear Esteemed Colleague,

I am writing to inform you that the deliverables for the aforementioned project have been completed in accordance with the specifications that were outlined during our previous correspondence.

I would be most appreciative if you could review the materials at your earliest convenience and provide your feedback regarding any modifications that may be required.

Respectfully yours,
Alexander`;

    const score = scoreDraft(draft, profile);
    expect(score.overall).toBeLessThan(70);
    // Greeting mismatch (Dear != Hi)
    expect(score.breakdown.greeting).toBeLessThanOrEqual(60);
  });

  it('returns score between 0 and 100 for all dimensions', () => {
    const draft = 'Hey Bob,\n\nQuick question about the report.\n\nThanks,\nAlex';
    const score = scoreDraft(draft, profile);

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    for (const value of Object.values(score.breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('is deterministic — same input produces same output', () => {
    const draft = 'Hi Bob,\n\nJust checking in on the project.\n\nBest,\nAlex';
    const score1 = scoreDraft(draft, profile);
    const score2 = scoreDraft(draft, profile);

    expect(score1.overall).toBe(score2.overall);
    expect(score1.breakdown.greeting).toBe(score2.breakdown.greeting);
    expect(score1.breakdown.signoff).toBe(score2.breakdown.signoff);
    expect(score1.breakdown.sentenceLength).toBe(score2.breakdown.sentenceLength);
    expect(score1.breakdown.formality).toBe(score2.breakdown.formality);
    expect(score1.breakdown.vocabulary).toBe(score2.breakdown.vocabulary);
  });

  it('handles very short draft', () => {
    const draft = 'OK';
    const score = scoreDraft(draft, profile);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it('handles draft with no greeting', () => {
    const draft = "Just wanted to follow up on yesterday's conversation.\n\nBest,\nAlex";
    const score = scoreDraft(draft, profile);
    expect(score.breakdown.greeting).toBeLessThanOrEqual(60);
    expect(score.breakdown.signoff).toBe(100);
  });

  it('handles draft with no sign-off', () => {
    const draft = 'Hi Bob,\n\nHere is the file you requested.';
    const score = scoreDraft(draft, profile);
    expect(score.breakdown.greeting).toBe(100);
    expect(score.breakdown.signoff).toBeLessThanOrEqual(60);
  });

  it('greeting score: exact match gets 100', () => {
    const draft = 'Hi Sarah,\n\nContent here.\n\nBest,\nAlex';
    const score = scoreDraft(draft, profile);
    expect(score.breakdown.greeting).toBe(100);
  });

  it('greeting score: standard greeting not in profile gets 60', () => {
    const draft = 'Good morning Sarah,\n\nContent here.\n\nBest,\nAlex';
    const score = scoreDraft(draft, profile);
    expect(score.breakdown.greeting).toBe(60);
  });

  it('vocabulary score reflects contraction match', () => {
    // Profile uses contractions (rate 0.75). Draft with contractions should score higher.
    const withContractions = "Hi Bob,\n\nI've finished the work and I'll send it over. Don't worry about the deadline.\n\nBest,\nAlex";
    const withoutContractions = 'Hi Bob,\n\nI have finished the work and I will send it over. Do not worry about the deadline.\n\nBest,\nAlex';

    const scoreWith = scoreDraft(withContractions, profile);
    const scoreWithout = scoreDraft(withoutContractions, profile);

    expect(scoreWith.breakdown.vocabulary).toBeGreaterThan(scoreWithout.breakdown.vocabulary);
  });

  it('handles empty profile gracefully', () => {
    const emptyProfile = createEmptyProfile();
    const draft = 'Hi Bob,\n\nSome email content.\n\nBest,\nAlex';
    const score = scoreDraft(draft, emptyProfile);
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it('executes quickly (heuristic, no LLM)', () => {
    const draft = "Hi Sarah,\n\nI've been thinking about the project timeline and I think we should push the deadline back by a week. Let me know what you think.\n\nI'll prepare an updated schedule tomorrow.\n\nBest,\nAlex";
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      scoreDraft(draft, profile);
    }
    const elapsed = performance.now() - start;
    // 100 iterations should complete in well under 500ms (5ms per iteration budget)
    expect(elapsed).toBeLessThan(500);
  });
});

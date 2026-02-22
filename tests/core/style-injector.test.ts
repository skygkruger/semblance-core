// Tests for Style Injector — prompt generation, context adaptation, token budget.

import { describe, it, expect } from 'vitest';
import {
  buildStylePrompt,
  buildInactiveStylePrompt,
  buildRetryPrompt,
  type DraftContext,
} from '@semblance/core/style/style-injector.js';
import { createEmptyProfile, type StyleProfile } from '@semblance/core/style/style-profile.js';

function makeActiveProfile(): StyleProfile {
  const profile = createEmptyProfile();
  profile.id = 'sp_test';
  profile.emailsAnalyzed = 50;
  profile.isActive = true;
  profile.greetings = {
    patterns: [
      { text: 'Hi', frequency: 0.7, contexts: ['colleague'] },
      { text: 'Hey', frequency: 0.2, contexts: ['friend'] },
      { text: 'Hello', frequency: 0.1, contexts: ['client'] },
    ],
    usesRecipientName: true,
    usesNameVariant: 'first',
  };
  profile.signoffs = {
    patterns: [
      { text: 'Best', frequency: 0.6, contexts: [] },
      { text: 'Thanks', frequency: 0.3, contexts: [] },
      { text: 'Cheers', frequency: 0.1, contexts: [] },
    ],
    includesName: true,
  };
  profile.tone = { formalityScore: 62, directnessScore: 78, warmthScore: 55 };
  profile.structure = {
    avgSentenceLength: 14,
    avgParagraphLength: 2.5,
    avgEmailLength: 85,
    usesListsOrBullets: true,
    listFrequency: 0.2,
  };
  profile.vocabulary = {
    commonPhrases: ['sounds good', 'let me know if you have any questions', 'happy to help'],
    avoidedWords: [],
    usesContractions: true,
    contractionRate: 0.82,
    usesEmoji: false,
    emojiFrequency: 0,
    commonEmoji: [],
    usesExclamation: true,
    exclamationRate: 0.15,
  };
  profile.contextVariations = [
    { context: 'colleague', formalityDelta: -10, toneNotes: 'More casual with colleagues, uses first names' },
    { context: 'client', formalityDelta: 15, toneNotes: 'More formal with clients' },
  ];
  return profile;
}

const defaultContext: DraftContext = {
  recipientEmail: 'bob@example.com',
  recipientName: 'Bob',
  isReply: false,
  subject: 'Project update',
};

describe('buildStylePrompt', () => {
  it('includes greeting patterns', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    expect(prompt).toContain('"Hi" (70%)');
    expect(prompt).toContain('"Hey" (20%)');
  });

  it('includes sign-off patterns', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    expect(prompt).toContain('"Best" (60%)');
    expect(prompt).toContain('"Thanks" (30%)');
  });

  it('includes tone description', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    expect(prompt).toContain('moderately formal');
    expect(prompt).toContain('direct');
  });

  it('includes contraction info', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    expect(prompt).toContain('contraction');
    expect(prompt).toContain('0.82');
  });

  it('includes common phrases', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    expect(prompt).toContain('sounds good');
    expect(prompt).toContain('happy to help');
  });

  it('adapts for recipient context (colleague)', () => {
    const ctx: DraftContext = { ...defaultContext, recipientContext: 'colleague' };
    const prompt = buildStylePrompt(makeActiveProfile(), ctx);
    expect(prompt).toContain('More casual with colleagues');
  });

  it('adapts for recipient context (client)', () => {
    const ctx: DraftContext = { ...defaultContext, recipientContext: 'client' };
    const prompt = buildStylePrompt(makeActiveProfile(), ctx);
    expect(prompt).toContain('client');
  });

  it('stays under 500 tokens for typical profile', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    // Rough token estimate: ~4 chars per token
    const estimatedTokens = prompt.length / 4;
    expect(estimatedTokens).toBeLessThan(500);
  });

  it('handles profile with no greeting patterns', () => {
    const profile = makeActiveProfile();
    profile.greetings.patterns = [];
    const prompt = buildStylePrompt(profile, defaultContext);
    expect(prompt).not.toContain('open with');
  });

  it('notes emoji non-usage', () => {
    const prompt = buildStylePrompt(makeActiveProfile(), defaultContext);
    expect(prompt).toContain('do not use emoji');
  });
});

describe('buildInactiveStylePrompt', () => {
  it('returns a professional generic prompt', () => {
    const prompt = buildInactiveStylePrompt();
    expect(prompt).toContain('professional');
    expect(prompt).toContain('natural');
    expect(prompt.length).toBeGreaterThan(50);
  });

  it('does not reference any profile-specific data', () => {
    const prompt = buildInactiveStylePrompt();
    expect(prompt).not.toContain('0.');  // No frequency numbers
    expect(prompt).not.toContain('/100');
  });
});

describe('buildRetryPrompt', () => {
  it('includes specific guidance for weak dimensions', () => {
    const profile = makeActiveProfile();
    const weakDimensions = [
      { name: 'greeting', score: 30 },
      { name: 'signoff', score: 50 },
    ];

    const prompt = buildRetryPrompt(weakDimensions, profile);
    expect(prompt).toContain('Hi');
    expect(prompt).toContain('Best');
    expect(prompt).toContain("didn't match");
  });

  it('returns empty string when no dimensions are weak', () => {
    const profile = makeActiveProfile();
    const strongDimensions = [
      { name: 'greeting', score: 90 },
      { name: 'signoff', score: 85 },
    ];

    const prompt = buildRetryPrompt(strongDimensions, profile);
    expect(prompt).toBe('');
  });
});

// Tests for Style Extractor — heuristic extraction, LLM-assisted extraction, incremental updates.

import { describe, it, expect, vi } from 'vitest';
import {
  extractStyleFromEmails,
  updateProfileWithNewEmails,
  extractUserText,
  detectGreeting,
  detectSignoff,
  splitSentences,
  type SentEmail,
} from '@semblance/core/style/style-extractor.js';
import { createEmptyProfile } from '@semblance/core/style/style-profile.js';
import type { LLMProvider, ChatResponse } from '@semblance/core/llm/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMockLLM(toneResponse?: Record<string, unknown>): LLMProvider {
  const defaultTone = {
    formality: 65,
    directness: 70,
    warmth: 55,
    commonPhrases: ['sounds good', 'let me know', 'happy to help'],
  };

  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockResolvedValue({
      message: {
        role: 'assistant',
        content: JSON.stringify(toneResponse ?? defaultTone),
      },
      model: 'llama3.2:8b',
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 200,
    } satisfies ChatResponse),
    embed: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

const CASUAL_EMAILS: SentEmail[] = [
  {
    id: '1', from: 'me@example.com', to: ['sarah@example.com'],
    subject: 'Re: Lunch tomorrow?',
    body: 'Hey Sarah,\n\nSounds good! Let me know if you want to try that new place.\n\nCheers,\nAlex',
    date: '2026-02-20T10:00:00Z',
  },
  {
    id: '2', from: 'me@example.com', to: ['mike@example.com'],
    subject: 'Re: Project update',
    body: "Hi Mike,\n\nI've finished the first draft. Can you take a look when you get a chance?\n\nThanks,\nAlex",
    date: '2026-02-19T14:00:00Z',
  },
  {
    id: '3', from: 'me@example.com', to: ['team@example.com'],
    subject: 'Meeting notes',
    body: "Hey team,\n\nHere are the notes from today's standup:\n\n- Feature A is on track\n- Bug B needs review\n- Sprint ends Friday\n\nLet me know if I missed anything!\n\nCheers,\nAlex",
    date: '2026-02-18T16:00:00Z',
  },
];

const FORMAL_EMAILS: SentEmail[] = [
  {
    id: '4', from: 'me@example.com', to: ['client@bigcorp.com'],
    subject: 'Q1 Deliverables',
    body: 'Dear Mr. Johnson,\n\nPlease find attached the Q1 deliverables as discussed in our last meeting. I would appreciate your review at your earliest convenience.\n\nBest regards,\nAlexander Smith',
    date: '2026-02-17T09:00:00Z',
  },
  {
    id: '5', from: 'me@example.com', to: ['hr@company.com'],
    subject: 'Vacation Request',
    body: 'Hello,\n\nI would like to request time off from March 10 to March 14. I have ensured that all deliverables will be completed before my departure.\n\nThank you for your consideration.\n\nSincerely,\nAlexander Smith',
    date: '2026-02-16T11:00:00Z',
  },
];

// ─── Helper Function Tests ──────────────────────────────────────────────────

describe('extractUserText', () => {
  it('strips forwarded message blocks', () => {
    const body = 'My comment here.\n\n---------- Forwarded message ----------\nFrom: someone\nOriginal text.';
    expect(extractUserText(body)).toBe('My comment here.');
  });

  it('strips reply chains', () => {
    const body = 'My reply here.\n\nOn Mon, Feb 20, 2026, Bob wrote:\n> Original message\n> More text';
    expect(extractUserText(body)).toBe('My reply here.');
  });

  it('strips quoted lines', () => {
    const body = 'My text.\n> quoted line\n> another quote\nMore of my text.';
    expect(extractUserText(body)).toBe('My text.\nMore of my text.');
  });

  it('handles emails with no forward/reply markers', () => {
    const body = 'Just a plain email.\n\nSecond paragraph.';
    expect(extractUserText(body)).toBe('Just a plain email.\n\nSecond paragraph.');
  });
});

describe('detectGreeting', () => {
  it('detects "Hi Sarah"', () => {
    expect(detectGreeting('Hi Sarah,\n\nHow are you?')).toBe('Hi Sarah');
  });

  it('detects "Hey"', () => {
    expect(detectGreeting('Hey,\n\nJust checking in.')).toBe('Hey');
  });

  it('detects "Dear Mr. Johnson"', () => {
    expect(detectGreeting('Dear Mr. Johnson,\n\nPlease find...')).toBe('Dear Mr. Johnson');
  });

  it('returns null for no greeting', () => {
    expect(detectGreeting('Just wanted to follow up on the issue.')).toBeNull();
  });
});

describe('detectSignoff', () => {
  it('detects "Cheers"', () => {
    expect(detectSignoff('Content here.\n\nCheers,\nAlex')).toBe('Cheers');
  });

  it('detects "Best regards"', () => {
    expect(detectSignoff('Content.\n\nBest regards,\nAlexander')).toBe('Best regards');
  });

  it('returns null for no sign-off', () => {
    expect(detectSignoff('OK')).toBeNull();
  });
});

describe('splitSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    const sentences = splitSentences('Hello there. How are you? I am fine!');
    expect(sentences).toHaveLength(3);
  });

  it('filters out very short fragments', () => {
    const sentences = splitSentences('OK. This is a full sentence.');
    // "OK." has only 1 word, should be filtered
    expect(sentences).toHaveLength(1);
  });
});

// ─── Full Extraction Tests ──────────────────────────────────────────────────

describe('extractStyleFromEmails', () => {
  it('extracts greeting patterns from casual emails', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.greetings.patterns.length).toBeGreaterThan(0);
    const greetingTexts = profile.greetings.patterns.map(p => p.text);
    expect(greetingTexts).toContain('Hey');
    expect(greetingTexts).toContain('Hi');
  });

  it('extracts sign-off patterns', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.signoffs.patterns.length).toBeGreaterThan(0);
    const signoffTexts = profile.signoffs.patterns.map(p => p.text);
    expect(signoffTexts).toContain('Cheers');
  });

  it('computes sentence length average', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.structure.avgSentenceLength).toBeGreaterThan(0);
  });

  it('detects list usage', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.structure.usesListsOrBullets).toBe(true);
    expect(profile.structure.listFrequency).toBeGreaterThan(0);
  });

  it('detects exclamation usage', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.vocabulary.exclamationRate).toBeGreaterThan(0);
  });

  it('uses LLM for tone scoring', async () => {
    const llm = makeMockLLM({ formality: 65, directness: 70, warmth: 55, commonPhrases: ['sounds good'] });
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.tone.formalityScore).toBe(65);
    expect(profile.tone.directnessScore).toBe(70);
    expect(profile.tone.warmthScore).toBe(55);
    expect(profile.vocabulary.commonPhrases).toContain('sounds good');
  });

  it('sets isActive=false when fewer than 20 emails', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    expect(profile.emailsAnalyzed).toBe(3);
    expect(profile.isActive).toBe(false);
  });

  it('handles empty email list', async () => {
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails([], llm);

    expect(profile.emailsAnalyzed).toBe(0);
    expect(profile.isActive).toBe(false);
    expect(profile.greetings.patterns).toHaveLength(0);
  });

  it('handles very short emails', async () => {
    const shortEmails: SentEmail[] = [
      { id: '1', from: 'me@ex.com', to: ['a@ex.com'], subject: 'Re: OK', body: 'Thanks', date: '2026-02-20T10:00:00Z' },
      { id: '2', from: 'me@ex.com', to: ['b@ex.com'], subject: 'Re: Yes', body: 'OK', date: '2026-02-19T10:00:00Z' },
    ];
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(shortEmails, llm);
    expect(profile.emailsAnalyzed).toBe(2);
  });

  it('handles reply chain emails', async () => {
    const replyEmail: SentEmail[] = [{
      id: '1', from: 'me@ex.com', to: ['bob@ex.com'],
      subject: 'Re: Meeting',
      body: "Hey Bob,\n\nSure, let's do 3pm.\n\nCheers,\nAlex\n\nOn Mon, Feb 20, 2026, Bob wrote:\n> Can we meet tomorrow?\n> What time works?",
      date: '2026-02-20T10:00:00Z',
    }];
    const llm = makeMockLLM();
    const profile = await extractStyleFromEmails(replyEmail, llm);
    const greeting = profile.greetings.patterns.find(p => p.text === 'Hey');
    expect(greeting).toBeDefined();
  });
});

// ─── Incremental Update Tests ───────────────────────────────────────────────

describe('updateProfileWithNewEmails', () => {
  it('merges new emails into existing profile', async () => {
    const llm = makeMockLLM();
    const existing = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    const updated = await updateProfileWithNewEmails(existing, FORMAL_EMAILS, llm);

    expect(updated.emailsAnalyzed).toBe(CASUAL_EMAILS.length + FORMAL_EMAILS.length);
  });

  it('preserves existing greeting patterns while adding new ones', async () => {
    const llm = makeMockLLM();
    const existing = await extractStyleFromEmails(CASUAL_EMAILS, llm);

    const updated = await updateProfileWithNewEmails(existing, FORMAL_EMAILS, llm);

    const allGreetings = updated.greetings.patterns.map(p => p.text);
    expect(allGreetings.length).toBeGreaterThan(0);
  });

  it('returns existing profile unchanged when no new emails', async () => {
    const llm = makeMockLLM();
    const existing = createEmptyProfile();
    existing.emailsAnalyzed = 10;

    const updated = await updateProfileWithNewEmails(existing, [], llm);
    expect(updated.emailsAnalyzed).toBe(10);
  });

  it('activates profile when total crosses 20 threshold', async () => {
    const llm = makeMockLLM();
    const existing = createEmptyProfile();
    existing.emailsAnalyzed = 18;

    // Generate 3 new emails to cross threshold
    const newEmails: SentEmail[] = [
      { id: '1', from: 'me@ex.com', to: ['a@ex.com'], subject: 'Test 1', body: 'Hi,\n\nContent.\n\nBest,\nAlex', date: '2026-02-20T10:00:00Z' },
      { id: '2', from: 'me@ex.com', to: ['b@ex.com'], subject: 'Test 2', body: 'Hey,\n\nMore content.\n\nThanks,\nAlex', date: '2026-02-19T10:00:00Z' },
      { id: '3', from: 'me@ex.com', to: ['c@ex.com'], subject: 'Test 3', body: 'Hello,\n\nFinal.\n\nCheers,\nAlex', date: '2026-02-18T10:00:00Z' },
    ];

    const updated = await updateProfileWithNewEmails(existing, newEmails, llm);
    expect(updated.emailsAnalyzed).toBe(21);
    expect(updated.isActive).toBe(true);
  });
});

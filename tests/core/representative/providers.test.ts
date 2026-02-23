/**
 * Step 20 — StyleProfileProvider + KnowledgeProvider tests.
 * Tests the provider wrappers that adapt existing style and knowledge systems
 * for the Digital Representative.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { StyleProfileStore, createEmptyProfile } from '@semblance/core/style/style-profile';
import type { StyleProfile } from '@semblance/core/style/style-profile';
import { StyleProfileProviderImpl } from '@semblance/core/representative/style-profile-provider';
import { KnowledgeProviderImpl } from '@semblance/core/representative/knowledge-provider';
import type { KnowledgeProvider, StyleProfileProvider } from '@semblance/core/representative/types';
import type { SearchResult } from '@semblance/core/knowledge/types';

let db: InstanceType<typeof Database>;
let store: StyleProfileStore;
let provider: StyleProfileProvider;

function makeActiveProfile(): StyleProfile {
  const profile = createEmptyProfile();
  profile.emailsAnalyzed = 25;
  profile.isActive = true;
  profile.greetings.patterns = [{ text: 'Hey', frequency: 0.6, contexts: ['colleague'] }];
  profile.signoffs.patterns = [{ text: 'Cheers', frequency: 0.8, contexts: [] }];
  profile.tone = { formalityScore: 35, directnessScore: 70, warmthScore: 60 };
  profile.vocabulary.usesContractions = true;
  profile.vocabulary.contractionRate = 0.6;
  profile.vocabulary.usesEmoji = false;
  profile.vocabulary.usesExclamation = true;
  profile.vocabulary.exclamationRate = 0.15;
  profile.structure.avgSentenceLength = 12;
  profile.structure.avgEmailLength = 80;
  return profile;
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new StyleProfileStore(db as unknown as DatabaseHandle);
  provider = new StyleProfileProviderImpl(store);
});

afterEach(() => {
  db.close();
});

describe('StyleProfileProviderImpl (Step 20)', () => {
  it('getProfile returns null when no profile exists', () => {
    expect(provider.getProfile()).toBeNull();
  });

  it('getProfile returns the active profile from the store', () => {
    const profile = makeActiveProfile();
    store.createProfile(profile);
    const result = provider.getProfile();
    expect(result).not.toBeNull();
    expect(result!.emailsAnalyzed).toBe(25);
  });

  it('hasMinimumData returns false when profile has < 20 emails', () => {
    const profile = createEmptyProfile();
    profile.emailsAnalyzed = 5;
    store.createProfile(profile);
    expect(provider.hasMinimumData()).toBe(false);
  });

  it('hasMinimumData returns true when profile is active', () => {
    store.createProfile(makeActiveProfile());
    expect(provider.hasMinimumData()).toBe(true);
  });

  it('getStyleScore returns null when no active profile', () => {
    expect(provider.getStyleScore('Hello there')).toBeNull();
  });

  it('getStyleScore returns a score when profile is active', () => {
    store.createProfile(makeActiveProfile());
    const score = provider.getStyleScore('Hey Alex,\n\nJust wanted to check in.\n\nCheers,\nSky');
    expect(score).not.toBeNull();
    expect(score!.overall).toBeGreaterThan(0);
    expect(score!.breakdown).toHaveProperty('greeting');
  });

  it('getStylePrompt returns inactive prompt when no active profile', () => {
    const prompt = provider.getStylePrompt({ isReply: false, subject: 'Test' });
    expect(prompt).toContain('professional');
  });

  it('getStylePrompt returns style-matched prompt when active', () => {
    store.createProfile(makeActiveProfile());
    const prompt = provider.getStylePrompt({ isReply: false, subject: 'Test' });
    expect(prompt).toContain('Hey');
    expect(prompt).toContain('personal writing style');
  });
});

describe('KnowledgeProviderImpl (Step 20)', () => {
  it('searchContext delegates to SemanticSearch.search', async () => {
    const mockResults: SearchResult[] = [{
      chunk: { id: 'c1', documentId: 'd1', content: 'test content', chunkIndex: 0, metadata: {} },
      document: {
        id: 'd1', source: 'email', title: 'Test', content: 'test', contentHash: 'abc',
        mimeType: 'text/plain', createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z', indexedAt: '2026-01-01T00:00:00Z', metadata: {},
      },
      score: 0.9,
    }];

    const mockSearch = {
      search: async (_query: string, _opts?: unknown) => mockResults,
    };

    const kp: KnowledgeProvider = new KnowledgeProviderImpl(mockSearch as never);
    const results = await kp.searchContext('test query', 5);
    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBe(0.9);
  });
});

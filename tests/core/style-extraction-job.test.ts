// Tests for Style Extraction Job — background processing, batching, resume, incremental updates.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  StyleExtractionJob,
  type SentEmailQuery,
  type ExtractionProgress,
  type StyleExtractionJobConfig,
} from '@semblance/core/style/style-extraction-job.js';
import { StyleProfileStore, createEmptyProfile } from '@semblance/core/style/style-profile.js';
import type { SentEmail } from '@semblance/core/style/style-extractor.js';
import type { LLMProvider, ChatResponse } from '@semblance/core/llm/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMockLLM(): LLMProvider {
  const defaultTone = {
    formality: 60,
    directness: 65,
    warmth: 55,
    commonPhrases: ['sounds good', 'let me know'],
  };

  const contextClassification = {
    classifications: [
      { index: 1, context: 'colleague' },
    ],
  };

  let callCount = 0;
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn().mockImplementation(() => {
      callCount++;
      // Alternate between tone and context responses
      const content = callCount % 2 === 1
        ? JSON.stringify(defaultTone)
        : JSON.stringify(contextClassification);
      return Promise.resolve({
        message: { role: 'assistant', content },
        model: 'llama3.2:8b',
        tokensUsed: { prompt: 100, completion: 50, total: 150 },
        durationMs: 200,
      } satisfies ChatResponse);
    }),
    embed: vi.fn(),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

function makeSentEmails(count: number, userEmail: string = 'me@example.com'): SentEmail[] {
  const emails: SentEmail[] = [];
  for (let i = 0; i < count; i++) {
    emails.push({
      id: `email_${i}`,
      from: userEmail,
      to: [`recipient${i}@example.com`],
      subject: `Subject ${i}`,
      body: `Hi there,\n\nThis is test email number ${i}. I've been working on the project and it's going well.\n\nLet me know if you have questions.\n\nBest,\nAlex`,
      date: new Date(2026, 1, 20, 10, i).toISOString(),
    });
  }
  return emails;
}

function makeSentEmailQuery(emails: SentEmail[]): SentEmailQuery {
  return {
    getSentEmails(_userEmail: string, options?: { since?: string; limit?: number; offset?: number }): SentEmail[] {
      let result = emails;

      if (options?.since) {
        result = result.filter(e => e.date > options.since!);
      }
      if (options?.offset !== undefined) {
        result = result.slice(options.offset);
      }
      if (options?.limit !== undefined) {
        result = result.slice(0, options.limit);
      }
      return result;
    },
    getSentEmailCount(_userEmail: string): number {
      return emails.length;
    },
  };
}

let db: Database.Database;
let store: StyleProfileStore;

beforeEach(() => {
  db = new Database(':memory:');
  store = new StyleProfileStore(db);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StyleExtractionJob', () => {
  describe('runInitialExtraction', () => {
    it('creates a profile from sent emails', async () => {
      const emails = makeSentEmails(5);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
        batchSize: 10,
      });

      const result = await job.runInitialExtraction(query);

      expect(result).not.toBeNull();
      expect(result!.emailsAnalyzed).toBe(5);
      expect(result!.id).toMatch(/^sp_/);

      // Profile should be persisted in store
      const stored = store.getActiveProfile();
      expect(stored).not.toBeNull();
      expect(stored!.emailsAnalyzed).toBe(5);
    });

    it('returns null when no sent emails exist', async () => {
      const query = makeSentEmailQuery([]);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
      });

      const result = await job.runInitialExtraction(query);
      expect(result).toBeNull();
    });

    it('processes emails in batches', async () => {
      const emails = makeSentEmails(25);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();
      const progressUpdates: ExtractionProgress[] = [];

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
        batchSize: 10,
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      const result = await job.runInitialExtraction(query);

      expect(result).not.toBeNull();
      expect(result!.emailsAnalyzed).toBeGreaterThanOrEqual(25);

      // Should have multiple progress updates (3 batches: 10+10+5, plus final completed)
      expect(progressUpdates.length).toBeGreaterThanOrEqual(3);

      // All running progress updates should report 'initial' phase
      const runningUpdates = progressUpdates.filter(p => p.status === 'running');
      for (const p of runningUpdates) {
        expect(p.phase).toBe('initial');
        expect(p.total).toBe(25);
      }

      // Last update should be 'completed'
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.status).toBe('completed');
      expect(lastUpdate.processed).toBe(25);
    });

    it('resumes from where it left off if profile exists', async () => {
      // Simulate a partially completed extraction by creating a profile with some emails analyzed
      const partialProfile = createEmptyProfile();
      partialProfile.emailsAnalyzed = 10;
      partialProfile.greetings.patterns = [{ text: 'Hi', frequency: 1.0, contexts: [] }];
      const created = store.createProfile(partialProfile);

      const emails = makeSentEmails(25);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();

      // Track which offsets are requested
      const requestedOffsets: number[] = [];
      const wrappedQuery: SentEmailQuery = {
        getSentEmails(userEmail: string, options?: { since?: string; limit?: number; offset?: number }): SentEmail[] {
          if (options?.offset !== undefined) {
            requestedOffsets.push(options.offset);
          }
          return query.getSentEmails(userEmail, options);
        },
        getSentEmailCount: query.getSentEmailCount,
      };

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
        batchSize: 10,
      });

      const result = await job.runInitialExtraction(wrappedQuery);

      expect(result).not.toBeNull();
      // Should resume from offset 10 (where the partial profile left off)
      expect(requestedOffsets[0]).toBe(10);
      // Should not start from 0
      expect(requestedOffsets).not.toContain(0);
    });

    it('prevents concurrent runs', async () => {
      const emails = makeSentEmails(5);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
      });

      // Start first run
      const firstRun = job.runInitialExtraction(query);

      // Attempt second run while first is in progress
      const secondResult = await job.runInitialExtraction(query);
      expect(secondResult).toBeNull();

      // First run should complete
      const firstResult = await firstRun;
      expect(firstResult).not.toBeNull();
    });

    it('can be cancelled mid-extraction', async () => {
      const emails = makeSentEmails(50);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();
      const progressUpdates: ExtractionProgress[] = [];

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
        batchSize: 5,
        onProgress: (p) => {
          progressUpdates.push({ ...p });
          // Cancel after first batch
          if (p.processed >= 5) {
            job.cancel();
          }
        },
      });

      const result = await job.runInitialExtraction(query);

      expect(result).not.toBeNull();
      // Should not have processed all 50 emails
      expect(result!.emailsAnalyzed).toBeLessThan(50);

      // Last progress update should report 'paused'
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.status).toBe('paused');

      // Job should no longer be running
      expect(job.getIsRunning()).toBe(false);
    });
  });

  describe('runIncrementalUpdate', () => {
    it('updates existing profile with new emails', async () => {
      // First create an initial profile
      const initialEmails = makeSentEmails(10);
      const initialQuery = makeSentEmailQuery(initialEmails);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
      });

      const initialProfile = await job.runInitialExtraction(initialQuery);
      expect(initialProfile).not.toBeNull();

      // Now simulate new emails arriving
      const newEmails = makeSentEmails(5).map(e => ({
        ...e,
        id: `new_${e.id}`,
        date: new Date(2026, 1, 21, 10, 0).toISOString(), // After the initial profile
      }));
      const allEmails = [...initialEmails, ...newEmails];
      const incrementalQuery = makeSentEmailQuery(allEmails);

      const updated = await job.runIncrementalUpdate(incrementalQuery);

      expect(updated).not.toBeNull();
      // Profile should reflect the incremental update
      expect(updated!.id).toBe(initialProfile!.id);
    });

    it('falls back to initial extraction when no profile exists', async () => {
      const emails = makeSentEmails(5);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
      });

      // No initial profile — should fall back to runInitialExtraction
      const result = await job.runIncrementalUpdate(query);

      expect(result).not.toBeNull();
      expect(result!.emailsAnalyzed).toBe(5);

      // Should have created a profile in the store
      const stored = store.getActiveProfile();
      expect(stored).not.toBeNull();
    });

    it('returns existing profile when no new emails since last update', async () => {
      // Create initial profile
      const emails = makeSentEmails(10);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
      });

      const initial = await job.runInitialExtraction(query);
      expect(initial).not.toBeNull();

      // Run incremental with same emails — no new ones since profile was updated
      // The profile's lastUpdatedAt is after all email dates, so getSentEmails(since: lastUpdatedAt) returns []
      const noNewQuery: SentEmailQuery = {
        getSentEmails(_userEmail: string, options?: { since?: string; limit?: number; offset?: number }): SentEmail[] {
          if (options?.since) {
            return []; // No emails after the profile update
          }
          return emails;
        },
        getSentEmailCount: () => emails.length,
      };

      const result = await job.runIncrementalUpdate(noNewQuery);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(initial!.id);
    });

    it('processes incremental updates in batches with progress', async () => {
      // Create initial profile
      const initialEmails = makeSentEmails(10);
      const initialQuery = makeSentEmailQuery(initialEmails);
      const llm = makeMockLLM();
      const progressUpdates: ExtractionProgress[] = [];

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
        batchSize: 3,
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      await job.runInitialExtraction(initialQuery);
      progressUpdates.length = 0; // Clear initial progress

      // Create new emails that will be "after" the profile update
      const newEmails: SentEmail[] = [];
      for (let i = 0; i < 8; i++) {
        newEmails.push({
          id: `new_${i}`,
          from: 'me@example.com',
          to: [`new_recipient${i}@example.com`],
          subject: `New subject ${i}`,
          body: `Hey,\n\nNew email content ${i}. Let me know what you think.\n\nBest,\nAlex`,
          date: new Date(2099, 0, 1, 10, i).toISOString(), // Far future to be "after" lastUpdatedAt
        });
      }

      const incrementalQuery: SentEmailQuery = {
        getSentEmails(_userEmail: string, options?: { since?: string; limit?: number; offset?: number }): SentEmail[] {
          if (options?.since) {
            return newEmails;
          }
          return [...initialEmails, ...newEmails];
        },
        getSentEmailCount: () => initialEmails.length + newEmails.length,
      };

      const result = await job.runIncrementalUpdate(incrementalQuery);

      expect(result).not.toBeNull();

      // Should have progress updates for incremental phase
      const incrementalUpdates = progressUpdates.filter(p => p.phase === 'incremental');
      expect(incrementalUpdates.length).toBeGreaterThanOrEqual(3); // 3+3+2 batches + completed

      // Last update should be completed
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.status).toBe('completed');
      expect(lastUpdate.phase).toBe('incremental');
    });
  });

  describe('state management', () => {
    it('tracks running state correctly', async () => {
      const emails = makeSentEmails(3);
      const query = makeSentEmailQuery(emails);
      const llm = makeMockLLM();

      const job = new StyleExtractionJob({
        profileStore: store,
        llm,
        model: 'test-model',
        userEmail: 'me@example.com',
      });

      expect(job.getIsRunning()).toBe(false);
      expect(job.getCurrentProfileId()).toBeNull();

      const result = await job.runInitialExtraction(query);

      expect(job.getIsRunning()).toBe(false);
      expect(job.getCurrentProfileId()).not.toBeNull();
      expect(job.getCurrentProfileId()).toBe(result!.id);
    });
  });
});

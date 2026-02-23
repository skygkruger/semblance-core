/**
 * ProactiveEngine extension tracker tests.
 * Verifies registerTracker adds a tracker, and extension tracker insights
 * appear in the run() output.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { ProactiveEngine } from '@semblance/core/agent/proactive-engine';
import type { ProactiveInsight } from '@semblance/core/agent/proactive-engine';
import { AutonomyManager } from '@semblance/core/agent/autonomy';
import type { KnowledgeGraph } from '@semblance/core/knowledge/index';
import type { EmailIndexer } from '@semblance/core/knowledge/email-indexer';
import type { CalendarIndexer } from '@semblance/core/knowledge/calendar-indexer';
import type { ExtensionInsightTracker } from '@semblance/core/extensions/types';

let db: InstanceType<typeof Database>;
let engine: ProactiveEngine;

function createMockKnowledge(): KnowledgeGraph {
  return {
    search: async () => [],
    ingest: async () => ({ documentId: '', chunksCreated: 0 }),
    getDocument: async () => null,
    listDocuments: async () => [],
    deleteDocument: async () => {},
    getEntities: async () => [],
    resolveEntity: async () => null,
    getStats: async () => ({ documentCount: 0, chunkCount: 0, entityCount: 0, vectorDimensions: 0 }),
  } as unknown as KnowledgeGraph;
}

function createMockEmailIndexer(): EmailIndexer {
  return {
    searchEmails: () => [],
    getIndexedEmails: () => [],
    indexEmail: () => {},
    getByMessageId: () => null,
  } as unknown as EmailIndexer;
}

function createMockCalendarIndexer(): CalendarIndexer {
  return {
    getUpcomingEvents: () => [],
    getByUid: () => null,
    indexEvent: () => {},
  } as unknown as CalendarIndexer;
}

beforeEach(() => {
  db = new Database(':memory:');
  const autonomy = new AutonomyManager(db as unknown as DatabaseHandle);
  engine = new ProactiveEngine({
    db: db as unknown as DatabaseHandle,
    knowledge: createMockKnowledge(),
    emailIndexer: createMockEmailIndexer(),
    calendarIndexer: createMockCalendarIndexer(),
    autonomy,
    pollIntervalMs: 999999, // don't actually poll in tests
  });
});

afterEach(() => {
  db.close();
});

describe('ProactiveEngine Extension Trackers', () => {
  it('registerTracker adds a tracker', () => {
    const tracker: ExtensionInsightTracker = {
      generateInsights: () => [],
    };

    // Should not throw
    engine.registerTracker(tracker);
  });

  it('extension tracker insights appear in run() output', async () => {
    const mockInsight: ProactiveInsight = {
      id: 'ext-insight-1',
      type: 'spending-alert' as ProactiveInsight['type'],
      priority: 'normal',
      title: 'Test extension insight',
      summary: 'Extension generated this',
      sourceIds: [],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 60,
    };

    const tracker: ExtensionInsightTracker = {
      generateInsights: () => [mockInsight],
    };

    engine.registerTracker(tracker);
    const insights = await engine.run();

    const extInsight = insights.find(i => i.id === 'ext-insight-1');
    expect(extInsight).toBeDefined();
    expect(extInsight!.title).toBe('Test extension insight');
  });
});

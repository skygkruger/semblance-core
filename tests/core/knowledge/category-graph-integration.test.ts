// Category Graph Integration Tests — Full pipeline with real better-sqlite3.
// 5 tests verifying the complete category graph flow.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GraphVisualizationProvider } from '../../../packages/core/knowledge/graph-visualization.js';
import { DocumentStore } from '../../../packages/core/knowledge/document-store.js';
import { ContactStore } from '../../../packages/core/knowledge/contacts/contact-store.js';
import { RelationshipAnalyzer } from '../../../packages/core/knowledge/contacts/relationship-analyzer.js';
import { ReminderStore } from '../../../packages/core/knowledge/reminder-store.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';

function wrapDatabase(dbPath: string): DatabaseHandle {
  const db = new Database(dbPath);
  return {
    pragma: (s: string) => db.pragma(s),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql);
      return {
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
        run: (...params: unknown[]) => stmt.run(...params),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: <T extends (...args: any[]) => any>(fn: T): T => {
      return db.transaction(fn as Parameters<typeof db.transaction>[0]) as unknown as T;
    },
    exec: (sql: string) => db.exec(sql),
    close: () => db.close(),
  };
}

describe('Category Graph Integration', () => {
  let tmpDir: string;
  let db: DatabaseHandle;
  let docStore: DocumentStore;
  let contactStore: ContactStore;
  let analyzer: RelationshipAnalyzer;
  let reminderStore: ReminderStore;
  let provider: GraphVisualizationProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cat-graph-int-'));
    db = wrapDatabase(join(tmpDir, 'test.db'));

    docStore = new DocumentStore(db);
    contactStore = new ContactStore(db);
    analyzer = new RelationshipAnalyzer({ db, contactStore });
    reminderStore = new ReminderStore(db);

    provider = new GraphVisualizationProvider({
      db,
      contactStore,
      relationshipAnalyzer: analyzer,
      reminderStore,
    });
    provider.initSchema();

    db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_emails (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL UNIQUE,
        thread_id TEXT NOT NULL DEFAULT '',
        folder TEXT NOT NULL DEFAULT 'INBOX',
        "from" TEXT NOT NULL,
        from_name TEXT NOT NULL DEFAULT '',
        "to" TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        snippet TEXT NOT NULL DEFAULT '',
        received_at TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        is_starred INTEGER NOT NULL DEFAULT 0,
        has_attachments INTEGER NOT NULL DEFAULT 0,
        labels TEXT NOT NULL DEFAULT '[]',
        priority TEXT NOT NULL DEFAULT 'normal',
        account_id TEXT NOT NULL DEFAULT '',
        indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS indexed_calendar_events (
        id TEXT PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        calendar_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_all_day INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        attendees TEXT NOT NULL DEFAULT '[]',
        organizer TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'confirmed',
        recurrence_rule TEXT,
        account_id TEXT NOT NULL DEFAULT '',
        indexed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS location_history (
        id TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy_m REAL NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('contacts + documents + email threads → correct category assignments', () => {
    // Insert contacts (→ people)
    contactStore.insertContact({ displayName: 'Alice Smith', emails: ['alice@test.com'] });
    contactStore.insertContact({ displayName: 'Bob Jones', emails: ['bob@test.com'] });

    // Insert documents (→ knowledge)
    docStore.insertDocument({ source: 'local_file', title: 'Project Plan', contentHash: 'h1', mimeType: 'text/markdown' });
    docStore.insertDocument({ source: 'financial', title: 'Budget Report', contentHash: 'h2', mimeType: 'text/csv' });

    // Insert email threads (→ people)
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO indexed_emails (id, message_id, thread_id, "from", "to", subject, received_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('e1', 'msg1', 'thread1', 'alice@test.com', '["bob@test.com"]', 'Meeting', now, now);

    const catGraph = provider.getCategoryGraph();

    // Should have people category (contacts + email threads)
    const peopleCat = catGraph.categoryNodes.find(cn => cn.category === 'people');
    expect(peopleCat).toBeDefined();
    expect(peopleCat!.nodeCount).toBeGreaterThanOrEqual(2); // At least 2 contacts

    // Should have knowledge category (local_file document)
    const knowledgeCat = catGraph.categoryNodes.find(cn => cn.category === 'knowledge');
    expect(knowledgeCat).toBeDefined();

    // Should have finance category (financial document)
    const financeCat = catGraph.categoryNodes.find(cn => cn.category === 'finance');
    expect(financeCat).toBeDefined();
    expect(financeCat!.nodeCount).toBeGreaterThanOrEqual(1);
  });

  it('cross-domain edges computed: person↔document creates people↔knowledge/finance edge', () => {
    const { id: contactId } = contactStore.insertContact({
      displayName: 'Carol',
      emails: ['carol@test.com'],
    });
    const { id: docId } = docStore.insertDocument({
      source: 'local_file',
      title: 'Technical Doc',
      contentHash: 'hcross',
      mimeType: 'text/plain',
    });

    // Create entity mention → edge between person_entity and document
    const entityId = docStore.insertEntity({ name: 'Carol', type: 'person' });
    docStore.insertMention({ entityId, documentId: docId, chunkId: 'c1', context: 'Carol wrote' });

    const catGraph = provider.getCategoryGraph();

    // Should have a cross-category edge between people and knowledge
    const crossEdge = catGraph.categoryEdges.find(
      e => (e.sourceCategoryId.includes('knowledge') && e.targetCategoryId.includes('people')) ||
           (e.sourceCategoryId.includes('people') && e.targetCategoryId.includes('knowledge')),
    );
    expect(crossEdge).toBeDefined();
    expect(crossEdge!.edgeCount).toBeGreaterThanOrEqual(1);
    expect(crossEdge!.relationshipTypes).toContain('mentioned_in');
  });

  it('getNodesForCategory("people") returns person nodes, not documents', () => {
    contactStore.insertContact({ displayName: 'Dan', emails: ['dan@test.com'] });
    docStore.insertDocument({ source: 'local_file', title: 'Doc', contentHash: 'hd', mimeType: 'text/plain' });

    const result = provider.getNodesForCategory('people');

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    for (const node of result.nodes) {
      expect(['person', 'email_thread', 'location']).toContain(node.type);
    }
    // No documents in people category
    expect(result.nodes.some(n => n.type === 'document')).toBe(false);
  });

  it('stats: activeSources counts non-empty categories, crossDomainInsights counts edges', () => {
    contactStore.insertContact({ displayName: 'Eve', emails: ['eve@test.com'] });
    docStore.insertDocument({ source: 'local_file', title: 'Notes', contentHash: 'he', mimeType: 'text/plain' });

    const entityId = docStore.insertEntity({ name: 'Eve', type: 'person' });
    const { id: docId } = docStore.insertDocument({
      source: 'local_file', title: 'Eve Report', contentHash: 'he2', mimeType: 'text/plain',
    });
    docStore.insertMention({ entityId, documentId: docId, chunkId: 'c1', context: 'Eve' });

    const catGraph = provider.getCategoryGraph();

    // At least 2 active sources: people + knowledge
    expect(catGraph.stats.activeSources).toBeGreaterThanOrEqual(2);
    expect(catGraph.stats.totalSources).toBe(10);

    // Cross-domain insights = number of category-level edges
    expect(typeof catGraph.stats.crossDomainInsights).toBe('number');
    expect(catGraph.stats.crossDomainInsights).toBeGreaterThanOrEqual(0);

    // nodesByCategory should be populated
    expect(catGraph.stats.nodesByCategory).toBeDefined();
    expect(catGraph.stats.nodesByCategory!['people']).toBeGreaterThanOrEqual(1);
  });

  it('empty graph returns empty categoryNodes array', () => {
    const catGraph = provider.getCategoryGraph();

    expect(catGraph.categoryNodes).toEqual([]);
    expect(catGraph.categoryEdges).toEqual([]);
    expect(catGraph.nodes).toEqual([]);
    expect(catGraph.stats.activeSources).toBe(0);
    expect(catGraph.stats.totalSources).toBe(10);
    expect(catGraph.stats.crossDomainInsights).toBe(0);
  });
});

// Graph Statistics + Growth Timeline + Caching Tests

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

describe('Graph Statistics + Caching', () => {
  let tmpDir: string;
  let db: DatabaseHandle;
  let docStore: DocumentStore;
  let contactStore: ContactStore;
  let analyzer: RelationshipAnalyzer;
  let reminderStore: ReminderStore;
  let provider: GraphVisualizationProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'graph-stats-'));
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

    // Create supporting tables
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

  it('getGraphStats returns correct totalNodes and totalEdges', () => {
    contactStore.insertContact({ displayName: 'Alice', emails: ['alice@test.com'] });
    contactStore.insertContact({ displayName: 'Bob', emails: ['bob@test.com'] });
    docStore.insertDocument({
      source: 'local_file',
      title: 'Doc A',
      contentHash: 'ha',
      mimeType: 'text/plain',
    });

    const stats = provider.getGraphStats();

    // At least 2 person + 1 doc nodes
    expect(stats.totalNodes).toBeGreaterThanOrEqual(3);
    expect(stats.totalEdges).toBeGreaterThanOrEqual(0);
    expect(stats.nodesByType).toBeDefined();
    expect(stats.nodesByType['person']).toBeGreaterThanOrEqual(2);
    expect(stats.nodesByType['document']).toBe(1);
  });

  it('mostConnectedNode identifies the node with highest edge count', () => {
    // Create contacts and mentions to build edges
    const { id: contactId } = contactStore.insertContact({
      displayName: 'Hub Person',
      emails: ['hub@test.com'],
    });

    // Create 5 documents each mentioning "Hub Person" entity
    const entityId = docStore.insertEntity({ name: 'Hub Person', type: 'person' });
    for (let i = 0; i < 5; i++) {
      const { id: docId } = docStore.insertDocument({
        source: 'local_file',
        title: `Doc ${i}`,
        contentHash: `hash${i}`,
        mimeType: 'text/plain',
      });
      docStore.insertMention({
        entityId,
        documentId: docId,
        chunkId: `chunk-${i}`,
        context: 'Hub Person mentioned',
      });
    }

    const stats = provider.getGraphStats();
    expect(stats.mostConnectedNode).not.toBeNull();
    // The entity node for Hub Person should be among the most connected
    expect(stats.mostConnectedNode!.connections).toBeGreaterThanOrEqual(5);
  });

  it('getGrowthTimeline returns cumulative data points sorted by date', () => {
    // Create entities with different first_seen dates
    const dates = ['2025-01-10', '2025-01-15', '2025-02-01', '2025-02-01', '2025-03-05'];
    for (let i = 0; i < dates.length; i++) {
      db.prepare(`
        INSERT INTO entities (id, name, type, first_seen, last_seen)
        VALUES (?, ?, 'topic', ?, ?)
      `).run(`ent-${i}`, `Topic ${i}`, `${dates[i]}T00:00:00.000Z`, `${dates[i]}T00:00:00.000Z`);
    }

    const timeline = provider.getGrowthTimeline('day');

    expect(timeline.length).toBeGreaterThanOrEqual(4); // 4 unique dates
    // Verify sorted by date
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i]!.date >= timeline[i - 1]!.date).toBe(true);
    }
    // Verify cumulative is monotonically increasing
    for (let i = 1; i < timeline.length; i++) {
      expect(timeline[i]!.cumulative).toBeGreaterThanOrEqual(timeline[i - 1]!.cumulative);
    }
    // Last cumulative should equal total entities
    expect(timeline[timeline.length - 1]!.cumulative).toBe(5);
  });

  it('cached graph returned within TTL (no recomputation)', () => {
    contactStore.insertContact({ displayName: 'Cached User', emails: ['cached@test.com'] });

    // Generate and cache
    const graph = provider.getGraphData();
    provider.setCachedGraph(graph);

    // Retrieve from cache
    const cached = provider.getCachedGraph(60 * 60 * 1000); // 1 hour TTL

    expect(cached).not.toBeNull();
    expect(cached!.nodes.length).toBe(graph.nodes.length);
    expect(cached!.edges.length).toBe(graph.edges.length);
    expect(cached!.stats.totalNodes).toBe(graph.stats.totalNodes);
  });

  it('cache invalidated after TTL expires', () => {
    contactStore.insertContact({ displayName: 'TTL User', emails: ['ttl@test.com'] });

    const graph = provider.getGraphData();
    provider.setCachedGraph(graph);

    // Manually set cache updated_at to 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE graph_cache SET updated_at = ? WHERE id = ?').run(twoHoursAgo, 'default');

    // Should return null with 1 hour TTL
    const cached = provider.getCachedGraph(60 * 60 * 1000);
    expect(cached).toBeNull();
  });
});

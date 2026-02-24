// Graph Visualization Provider Tests — Entity/edge extraction and capping.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('GraphVisualizationProvider', () => {
  let tmpDir: string;
  let db: DatabaseHandle;
  let docStore: DocumentStore;
  let contactStore: ContactStore;
  let analyzer: RelationshipAnalyzer;
  let reminderStore: ReminderStore;
  let provider: GraphVisualizationProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'graph-viz-'));
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

    // Create indexed_emails and indexed_calendar_events tables for testing
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

  it('creates person nodes from contacts', () => {
    contactStore.insertContact({
      displayName: 'Alice Smith',
      emails: ['alice@example.com'],
      organization: 'Acme Corp',
    });
    contactStore.insertContact({
      displayName: 'Bob Jones',
      emails: ['bob@example.com'],
    });

    const graph = provider.getGraphData();
    const personNodes = graph.nodes.filter(n => n.type === 'person');

    expect(personNodes.length).toBeGreaterThanOrEqual(2);
    const alice = personNodes.find(n => n.label === 'Alice Smith');
    expect(alice).toBeDefined();
    expect(alice!.type).toBe('person');
    expect(alice!.metadata.organization).toBe('Acme Corp');
  });

  it('creates document nodes from documents table', () => {
    docStore.insertDocument({
      source: 'local_file',
      title: 'Project Roadmap',
      contentHash: 'hash123',
      mimeType: 'text/markdown',
    });
    docStore.insertDocument({
      source: 'email',
      title: 'Meeting Notes',
      contentHash: 'hash456',
      mimeType: 'text/plain',
    });

    const graph = provider.getGraphData();
    const docNodes = graph.nodes.filter(n => n.type === 'document');

    expect(docNodes.length).toBe(2);
    expect(docNodes.some(n => n.label === 'Project Roadmap')).toBe(true);
    expect(docNodes.some(n => n.label === 'Meeting Notes')).toBe(true);
  });

  it('creates event nodes from calendar events', () => {
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(); // yesterday
    const endTime = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO indexed_calendar_events (id, uid, title, start_time, end_time, attendees, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('evt-1', 'uid-1', 'Team Standup', startTime, endTime, '["alice@example.com","bob@example.com"]', now.toISOString());

    const graph = provider.getGraphData();
    const eventNodes = graph.nodes.filter(n => n.type === 'event');

    expect(eventNodes.length).toBe(1);
    expect(eventNodes[0]!.label).toBe('Team Standup');
    expect(eventNodes[0]!.size).toBe(2); // 2 attendees
  });

  it('creates edges between person and document via entity_mentions', () => {
    // Create a contact
    const { id: contactId } = contactStore.insertContact({
      displayName: 'Charlie Brown',
      emails: ['charlie@example.com'],
    });

    // Create a document
    const { id: docId } = docStore.insertDocument({
      source: 'local_file',
      title: 'Performance Review',
      contentHash: 'hash789',
      mimeType: 'text/plain',
    });

    // Create an entity for Charlie and a mention in the document
    const entityId = docStore.insertEntity({
      name: 'Charlie Brown',
      type: 'person',
    });

    docStore.insertMention({
      entityId,
      documentId: docId,
      chunkId: 'chunk-1',
      context: 'Charlie Brown did excellent work',
    });

    const graph = provider.getGraphData();

    // Find the entity node and document node
    const entityNode = graph.nodes.find(n => n.id === `person_entity_${entityId}`);
    const docNode = graph.nodes.find(n => n.id === `document_${docId}`);

    expect(entityNode).toBeDefined();
    expect(docNode).toBeDefined();

    // Check edge exists
    const mentionEdge = graph.edges.find(
      e => e.label === 'mentioned_in' &&
        ((e.sourceId === entityNode!.id && e.targetId === docNode!.id) ||
         (e.sourceId === docNode!.id && e.targetId === entityNode!.id))
    );
    expect(mentionEdge).toBeDefined();
  });

  it('creates edges between person and event via attendees', () => {
    const { id: contactId } = contactStore.insertContact({
      displayName: 'Diana Prince',
      emails: ['diana@example.com'],
    });

    const now = new Date();
    const startTime = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const endTime = new Date(now.getTime() - 11 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO indexed_calendar_events (id, uid, title, start_time, end_time, attendees, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('evt-2', 'uid-2', 'Strategy Meeting', startTime, endTime, '["diana@example.com"]', now.toISOString());

    const graph = provider.getGraphData();

    const personNode = graph.nodes.find(n => n.id === `person_${contactId}`);
    const eventNode = graph.nodes.find(n => n.id === 'event_evt-2');

    expect(personNode).toBeDefined();
    expect(eventNode).toBeDefined();

    const attendeeEdge = graph.edges.find(
      e => e.label === 'attended' &&
        ((e.sourceId === personNode!.id && e.targetId === eventNode!.id) ||
         (e.sourceId === eventNode!.id && e.targetId === personNode!.id))
    );
    expect(attendeeEdge).toBeDefined();
  });

  it('enforces node cap (maxNodes, most-connected retained)', () => {
    // Create 210 contacts to exceed 200 cap
    for (let i = 0; i < 210; i++) {
      contactStore.insertContact({
        displayName: `Contact ${i}`,
        emails: [`contact${i}@example.com`],
      });
    }

    const graph = provider.getGraphData({ maxNodes: 200 });
    expect(graph.nodes.length).toBeLessThanOrEqual(200);
  });

  it('enforces edge cap (3x nodes, weakest pruned)', () => {
    // Create contacts with cross-references to generate many edges
    const contacts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { id } = contactStore.insertContact({
        displayName: `Person ${i}`,
        emails: [`person${i}@example.com`],
      });
      contacts.push(id);
    }

    // Create many email threads to generate edges
    const now = new Date().toISOString();
    for (let i = 0; i < 50; i++) {
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", "to", subject, received_at, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `email-${i}`, `msg-${i}`, `thread-${i % 10}`,
        `person${i % 5}@example.com`,
        JSON.stringify([`person${(i + 1) % 5}@example.com`]),
        `Subject ${i}`, now, now,
      );
    }

    // Use a tiny edge cap to verify pruning
    const graph = provider.getGraphData({ maxNodes: 10, edgeCapMultiplier: 1 });
    expect(graph.edges.length).toBeLessThanOrEqual(graph.nodes.length * 1);
  });

  it('getNodeContext returns connections for a person node', () => {
    const { id: contactId } = contactStore.insertContact({
      displayName: 'Eve Adams',
      emails: ['eve@example.com'],
    });

    const { id: docId } = docStore.insertDocument({
      source: 'local_file',
      title: 'Eve Project Plan',
      contentHash: 'hasheve',
      mimeType: 'text/markdown',
    });

    const entityId = docStore.insertEntity({ name: 'Eve Adams', type: 'person' });
    docStore.insertMention({ entityId, documentId: docId, chunkId: 'c1', context: 'Eve' });

    const nodeId = `person_entity_${entityId}`;
    const context = provider.getNodeContext(nodeId);

    expect(context).not.toBeNull();
    expect(context!.node.label).toBe('Eve Adams');
    expect(context!.connections.length).toBeGreaterThanOrEqual(1);
    expect(context!.recentActivity.length).toBeGreaterThanOrEqual(1);
  });
});

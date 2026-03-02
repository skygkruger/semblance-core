// Conversation Indexer — Unit tests for semantic indexing of conversation turns into LanceDB.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConversationIndexer } from '../../packages/core/agent/conversation-indexer.js';
import type { IndexTurnParams, ConversationSearchResult } from '../../packages/core/agent/conversation-indexer.js';

// ─── Mock KnowledgeGraph ──────────────────────────────────────────────────

function makeMockKnowledge() {
  return {
    indexDocument: vi.fn().mockResolvedValue({ documentId: 'doc-mock-1' }),
    search: vi.fn().mockResolvedValue([]),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
  };
}

let db: Database.Database;
let knowledge: ReturnType<typeof makeMockKnowledge>;
let indexer: ConversationIndexer;

function setupSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      pinned_at TEXT,
      auto_title TEXT,
      turn_count INTEGER NOT NULL DEFAULT 0,
      last_message_preview TEXT,
      expires_at TEXT
    )
  `);
  database.exec(`
    CREATE TABLE conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE conversation_embeddings (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

function insertConversation(id: string, title: string | null, autoTitle: string | null): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations (id, created_at, updated_at, title, pinned, auto_title, turn_count)
     VALUES (?, ?, ?, ?, 0, ?, 0)`
  ).run(id, now, now, title, autoTitle);
}

beforeEach(() => {
  db = new Database(':memory:');
  setupSchema(db);
  knowledge = makeMockKnowledge();
  indexer = new ConversationIndexer({ db, knowledge: knowledge as never });
});

afterEach(() => {
  db.close();
});

// ─── indexTurn ───────────────────────────────────────────────────────────────

describe('ConversationIndexer — indexTurn()', () => {
  const baseTurn: IndexTurnParams = {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    role: 'assistant',
    content: 'The weather in Portland is rainy today with 55F.',
    timestamp: '2026-03-01T10:00:00.000Z',
  };

  it('calls knowledge.indexDocument with source "conversation"', async () => {
    insertConversation('conv-1', null, 'Weather check');
    await indexer.indexTurn(baseTurn);

    expect(knowledge.indexDocument).toHaveBeenCalledTimes(1);
    const call = knowledge.indexDocument.mock.calls[0][0];
    expect(call.source).toBe('conversation');
    expect(call.sourcePath).toBe('conversation://conv-1/turn-1');
    expect(call.content).toContain('weather in Portland');
  });

  it('includes metadata with conversationId, turnId, role, timestamp', async () => {
    insertConversation('conv-1', null, 'Test');
    await indexer.indexTurn(baseTurn);

    const call = knowledge.indexDocument.mock.calls[0][0];
    expect(call.metadata.conversationId).toBe('conv-1');
    expect(call.metadata.turnId).toBe('turn-1');
    expect(call.metadata.role).toBe('assistant');
    expect(call.metadata.timestamp).toBe('2026-03-01T10:00:00.000Z');
  });

  it('records chunk mapping in conversation_embeddings table', async () => {
    insertConversation('conv-1', null, 'Test');
    await indexer.indexTurn(baseTurn);

    const rows = db.prepare('SELECT * FROM conversation_embeddings WHERE conversation_id = ?').all('conv-1') as unknown[];
    expect(rows).toHaveLength(1);
  });

  it('truncates content to 2000 chars', async () => {
    insertConversation('conv-1', null, 'Long');
    const longContent = 'x'.repeat(3000);
    await indexer.indexTurn({ ...baseTurn, content: longContent });

    const call = knowledge.indexDocument.mock.calls[0][0];
    expect(call.content.length).toBe(2000);
  });

  it('skips empty content', async () => {
    insertConversation('conv-1', null, 'Empty');
    await indexer.indexTurn({ ...baseTurn, content: '' });
    expect(knowledge.indexDocument).not.toHaveBeenCalled();
  });

  it('skips whitespace-only content', async () => {
    insertConversation('conv-1', null, 'Empty');
    await indexer.indexTurn({ ...baseTurn, content: '   \n\t  ' });
    expect(knowledge.indexDocument).not.toHaveBeenCalled();
  });

  it('uses conversation title in indexed document title', async () => {
    insertConversation('conv-1', 'My Custom Title', null);
    await indexer.indexTurn(baseTurn);

    const call = knowledge.indexDocument.mock.calls[0][0];
    expect(call.title).toContain('My Custom Title');
  });

  it('falls back to auto_title when title is null', async () => {
    insertConversation('conv-1', null, 'Auto Generated Title');
    await indexer.indexTurn(baseTurn);

    const call = knowledge.indexDocument.mock.calls[0][0];
    expect(call.title).toContain('Auto Generated Title');
  });
});

// ─── searchConversations ────────────────────────────────────────────────────

describe('ConversationIndexer — searchConversations()', () => {
  it('calls knowledge.search with source filter "conversation"', async () => {
    await indexer.searchConversations('portland weather', 5);
    expect(knowledge.search).toHaveBeenCalledWith('portland weather', {
      limit: 10, // 5 * 2 (double for dedup)
      source: 'conversation',
    });
  });

  it('returns empty array when no results', async () => {
    const results = await indexer.searchConversations('nothing', 5);
    expect(results).toEqual([]);
  });

  it('enriches results with conversation title from database', async () => {
    insertConversation('conv-1', 'Portland Notes', null);

    knowledge.search.mockResolvedValueOnce([{
      score: 0.95,
      chunk: {
        content: 'The Portland contract was signed last week.',
        metadata: {
          conversationId: 'conv-1',
          turnId: 'turn-1',
          role: 'assistant',
          timestamp: '2026-03-01T10:00:00.000Z',
        },
      },
    }]);

    const results = await indexer.searchConversations('portland', 5);
    expect(results).toHaveLength(1);
    expect(results[0].conversationTitle).toBe('Portland Notes');
    expect(results[0].score).toBe(0.95);
    expect(results[0].turnId).toBe('turn-1');
  });

  it('respects limit parameter', async () => {
    insertConversation('conv-1', 'A', null);
    insertConversation('conv-2', 'B', null);

    knowledge.search.mockResolvedValueOnce([
      { score: 0.9, chunk: { content: 'Result 1', metadata: { conversationId: 'conv-1', turnId: 't-1', role: 'user', timestamp: '' } } },
      { score: 0.8, chunk: { content: 'Result 2', metadata: { conversationId: 'conv-2', turnId: 't-2', role: 'user', timestamp: '' } } },
      { score: 0.7, chunk: { content: 'Result 3', metadata: { conversationId: 'conv-1', turnId: 't-3', role: 'user', timestamp: '' } } },
    ]);

    const results = await indexer.searchConversations('query', 2);
    expect(results).toHaveLength(2);
  });
});

// ─── removeConversation ─────────────────────────────────────────────────────

describe('ConversationIndexer — removeConversation()', () => {
  it('deletes documents from knowledge graph', async () => {
    insertConversation('conv-1', null, 'Test');

    // Insert some embeddings
    db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('emb-1', 'conv-1', 'turn-1', 'chunk-1', new Date().toISOString());
    db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('emb-2', 'conv-1', 'turn-2', 'chunk-2', new Date().toISOString());

    await indexer.removeConversation('conv-1');
    expect(knowledge.deleteDocument).toHaveBeenCalledTimes(2);
    expect(knowledge.deleteDocument).toHaveBeenCalledWith('chunk-1');
    expect(knowledge.deleteDocument).toHaveBeenCalledWith('chunk-2');
  });

  it('cleans up conversation_embeddings table', async () => {
    db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('emb-1', 'conv-1', 'turn-1', 'chunk-1', new Date().toISOString());

    await indexer.removeConversation('conv-1');
    const rows = db.prepare('SELECT * FROM conversation_embeddings WHERE conversation_id = ?').all('conv-1');
    expect(rows).toHaveLength(0);
  });

  it('handles missing documents gracefully', async () => {
    knowledge.deleteDocument.mockRejectedValue(new Error('Not found'));

    db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('emb-1', 'conv-1', 'turn-1', 'chunk-1', new Date().toISOString());

    // Should not throw
    await expect(indexer.removeConversation('conv-1')).resolves.toBeUndefined();
  });
});

// ─── isIndexed ──────────────────────────────────────────────────────────────

describe('ConversationIndexer — isIndexed()', () => {
  it('returns false for unindexed turn', () => {
    expect(indexer.isIndexed('turn-nonexistent')).toBe(false);
  });

  it('returns true for indexed turn', () => {
    db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('emb-1', 'conv-1', 'turn-1', 'chunk-1', new Date().toISOString());
    expect(indexer.isIndexed('turn-1')).toBe(true);
  });
});

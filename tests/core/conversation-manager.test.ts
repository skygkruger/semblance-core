// Conversation Manager — Unit tests for multi-conversation CRUD, pinning, expiry, search.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConversationManager } from '../../packages/core/agent/conversation-manager.js';
import type { ConversationSummary } from '../../packages/core/agent/conversation-manager.js';

let db: Database.Database;
let manager: ConversationManager;

function setupSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT
    )
  `);
  database.exec(`
    CREATE TABLE conversation_turns (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      context_json TEXT,
      actions_json TEXT,
      tokens_prompt INTEGER,
      tokens_completion INTEGER
    )
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  setupSchema(db);
  manager = new ConversationManager(db);
  manager.migrate();
});

afterEach(() => {
  db.close();
});

// ─── Migration ──────────────────────────────────────────────────────────────

describe('ConversationManager — migrate()', () => {
  it('adds new columns to conversations table', () => {
    // Verify columns exist by doing a SELECT
    const row = db.prepare(`
      SELECT pinned, pinned_at, auto_title, turn_count, last_message_preview, expires_at
      FROM conversations LIMIT 0
    `).all();
    expect(row).toEqual([]);
  });

  it('creates conversation_embeddings table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_embeddings'"
    ).all();
    expect(tables).toHaveLength(1);
  });

  it('is idempotent — calling migrate() twice does not throw', () => {
    expect(() => manager.migrate()).not.toThrow();
    expect(() => manager.migrate()).not.toThrow();
  });
});

// ─── Create ─────────────────────────────────────────────────────────────────

describe('ConversationManager — create()', () => {
  it('creates a conversation with a unique ID', () => {
    const conv = manager.create();
    expect(conv.id).toBeTruthy();
    expect(conv.id.length).toBeGreaterThan(5);
  });

  it('sets timestamps on creation', () => {
    const conv = manager.create();
    expect(conv.createdAt).toBeTruthy();
    expect(conv.updatedAt).toBeTruthy();
    expect(new Date(conv.createdAt).getTime()).not.toBeNaN();
  });

  it('auto-titles from first user message (6 words, 50 chars max)', () => {
    const conv = manager.create('What is the weather like in Portland today');
    expect(conv.autoTitle).toBe('What is the weather like in');
  });

  it('truncates auto-title to 50 characters', () => {
    const longMessage = 'Supercalifragilisticexpialidocious extraordinary amazing wonderful fantastic incredible';
    const conv = manager.create(longMessage);
    expect(conv.autoTitle!.length).toBeLessThanOrEqual(50);
  });

  it('starts with no user title', () => {
    const conv = manager.create();
    expect(conv.title).toBeNull();
  });

  it('starts unpinned with zero turns', () => {
    const conv = manager.create();
    expect(conv.pinned).toBe(false);
    expect(conv.turnCount).toBe(0);
  });

  it('creates distinct IDs for multiple conversations', () => {
    const a = manager.create();
    const b = manager.create();
    expect(a.id).not.toBe(b.id);
  });
});

// ─── List ───────────────────────────────────────────────────────────────────

describe('ConversationManager — list()', () => {
  it('returns empty array when no conversations exist', () => {
    expect(manager.list()).toEqual([]);
  });

  it('returns conversations ordered with most recent first', () => {
    const a = manager.create('First');
    const b = manager.create('Second');
    const c = manager.create('Third');
    // Force distinct updated_at timestamps
    db.prepare("UPDATE conversations SET updated_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(a.id);
    db.prepare("UPDATE conversations SET updated_at = '2026-01-02T00:00:00Z' WHERE id = ?").run(b.id);
    db.prepare("UPDATE conversations SET updated_at = '2026-01-03T00:00:00Z' WHERE id = ?").run(c.id);
    const list = manager.list();
    expect(list).toHaveLength(3);
    // Most recently updated should be first
    expect(list[0]!.autoTitle).toContain('Third');
  });

  it('respects limit option', () => {
    manager.create('A');
    manager.create('B');
    manager.create('C');
    const list = manager.list({ limit: 2 });
    expect(list).toHaveLength(2);
  });

  it('respects offset option', () => {
    manager.create('A');
    manager.create('B');
    manager.create('C');
    const list = manager.list({ limit: 10, offset: 1 });
    expect(list).toHaveLength(2);
  });

  it('pinnedOnly returns only pinned conversations', () => {
    const a = manager.create('Pinned');
    manager.create('Not pinned');
    manager.pin(a.id);
    const list = manager.list({ pinnedOnly: true });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(a.id);
  });

  it('search filters by title/autoTitle/preview', () => {
    manager.create('portland weather');
    manager.create('seattle traffic');
    const list = manager.list({ search: 'portland' });
    expect(list).toHaveLength(1);
    expect(list[0]!.autoTitle).toContain('portland');
  });

  it('pinned conversations appear first in default list', () => {
    const a = manager.create('First');
    const b = manager.create('Second');
    manager.pin(a.id);
    const list = manager.list();
    expect(list[0]!.id).toBe(a.id);
    expect(list[0]!.pinned).toBe(true);
  });
});

// ─── Get ────────────────────────────────────────────────────────────────────

describe('ConversationManager — get()', () => {
  it('returns null for non-existent conversation', () => {
    expect(manager.get('nonexistent')).toBeNull();
  });

  it('returns conversation with empty turns array', () => {
    const created = manager.create('Test');
    const conv = manager.get(created.id);
    expect(conv).not.toBeNull();
    expect(conv!.id).toBe(created.id);
    expect(conv!.turns).toEqual([]);
  });

  it('returns conversation with turns when they exist', () => {
    const created = manager.create();
    // Insert a turn directly
    db.prepare(
      `INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('turn-1', created.id, 'user', 'Hello', new Date().toISOString());

    const conv = manager.get(created.id);
    expect(conv!.turns).toHaveLength(1);
    expect(conv!.turns[0]!.role).toBe('user');
    expect(conv!.turns[0]!.content).toBe('Hello');
  });
});

// ─── getTurns ───────────────────────────────────────────────────────────────

describe('ConversationManager — getTurns()', () => {
  it('returns empty array for conversation with no turns', () => {
    const conv = manager.create();
    expect(manager.getTurns(conv.id)).toEqual([]);
  });

  it('returns turns in timestamp ASC order', () => {
    const conv = manager.create();
    const now = Date.now();
    db.prepare(
      `INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('t-1', conv.id, 'user', 'First', new Date(now).toISOString());
    db.prepare(
      `INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('t-2', conv.id, 'assistant', 'Second', new Date(now + 1000).toISOString());

    const turns = manager.getTurns(conv.id);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.content).toBe('First');
    expect(turns[1]!.content).toBe('Second');
  });

  it('respects limit and offset', () => {
    const conv = manager.create();
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`
      ).run(`t-${i}`, conv.id, 'user', `Turn ${i}`, new Date(Date.now() + i * 1000).toISOString());
    }
    const turns = manager.getTurns(conv.id, 2, 1);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.content).toBe('Turn 1');
  });
});

// ─── Rename ─────────────────────────────────────────────────────────────────

describe('ConversationManager — rename()', () => {
  it('sets user-provided title', () => {
    const conv = manager.create('original');
    manager.rename(conv.id, 'My Custom Title');
    const updated = manager.get(conv.id);
    expect(updated!.title).toBe('My Custom Title');
  });

  it('updates the updated_at timestamp', () => {
    const conv = manager.create();
    // Force an older timestamp so the rename produces a newer one
    db.prepare("UPDATE conversations SET updated_at = '2020-01-01T00:00:00Z' WHERE id = ?").run(conv.id);
    manager.rename(conv.id, 'Renamed');
    const updated = manager.get(conv.id);
    expect(updated!.updatedAt).not.toBe('2020-01-01T00:00:00Z');
  });
});

// ─── Delete ─────────────────────────────────────────────────────────────────

describe('ConversationManager — delete()', () => {
  it('removes the conversation', () => {
    const conv = manager.create();
    manager.delete(conv.id);
    expect(manager.get(conv.id)).toBeNull();
  });

  it('cascades to conversation_turns', () => {
    const conv = manager.create();
    db.prepare(
      `INSERT INTO conversation_turns (id, conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).run('t-1', conv.id, 'user', 'Hello', new Date().toISOString());

    manager.delete(conv.id);
    const turns = db.prepare('SELECT * FROM conversation_turns WHERE conversation_id = ?').all(conv.id);
    expect(turns).toHaveLength(0);
  });

  it('cascades to conversation_embeddings', () => {
    const conv = manager.create();
    db.prepare(
      `INSERT INTO conversation_embeddings (id, conversation_id, turn_id, chunk_id, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run('emb-1', conv.id, 'turn-1', 'chunk-1', new Date().toISOString());

    manager.delete(conv.id);
    const embeddings = db.prepare('SELECT * FROM conversation_embeddings WHERE conversation_id = ?').all(conv.id);
    expect(embeddings).toHaveLength(0);
  });
});

// ─── Pin / Unpin ────────────────────────────────────────────────────────────

describe('ConversationManager — pin() / unpin()', () => {
  it('pins a conversation', () => {
    const conv = manager.create();
    manager.pin(conv.id);
    const updated = manager.get(conv.id);
    expect(updated!.pinned).toBe(true);
    expect(updated!.pinnedAt).toBeTruthy();
  });

  it('unpins a conversation', () => {
    const conv = manager.create();
    manager.pin(conv.id);
    manager.unpin(conv.id);
    const updated = manager.get(conv.id);
    expect(updated!.pinned).toBe(false);
    expect(updated!.pinnedAt).toBeNull();
  });
});

// ─── searchByTitle ──────────────────────────────────────────────────────────

describe('ConversationManager — searchByTitle()', () => {
  it('finds conversations by auto_title LIKE match', () => {
    manager.create('help me with portland contract');
    manager.create('what is the best pizza');
    const results = manager.searchByTitle('portland');
    expect(results).toHaveLength(1);
  });

  it('finds conversations by user title', () => {
    const conv = manager.create('something');
    manager.rename(conv.id, 'My Portland Notes');
    const results = manager.searchByTitle('Portland');
    expect(results).toHaveLength(1);
  });

  it('returns empty array for no matches', () => {
    manager.create('hello world');
    expect(manager.searchByTitle('xyz123')).toEqual([]);
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      manager.create(`search term item ${i}`);
    }
    const results = manager.searchByTitle('search', 2);
    expect(results).toHaveLength(2);
  });
});

// ─── pruneExpired ───────────────────────────────────────────────────────────

describe('ConversationManager — pruneExpired()', () => {
  it('deletes conversations past their expiry', () => {
    const conv = manager.create();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    manager.setExpiry(conv.id, pastDate);
    const pruned = manager.pruneExpired();
    expect(pruned).toBe(1);
    expect(manager.get(conv.id)).toBeNull();
  });

  it('does not delete pinned conversations even if expired', () => {
    const conv = manager.create();
    manager.pin(conv.id);
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    manager.setExpiry(conv.id, pastDate);
    const pruned = manager.pruneExpired();
    expect(pruned).toBe(0);
    expect(manager.get(conv.id)).not.toBeNull();
  });

  it('does not delete conversations without expiry', () => {
    manager.create();
    expect(manager.pruneExpired()).toBe(0);
  });

  it('does not delete conversations with future expiry', () => {
    const conv = manager.create();
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString();
    manager.setExpiry(conv.id, futureDate);
    expect(manager.pruneExpired()).toBe(0);
  });
});

// ─── setExpiry ──────────────────────────────────────────────────────────────

describe('ConversationManager — setExpiry()', () => {
  it('sets an expiry date', () => {
    const conv = manager.create();
    const expiry = new Date(Date.now() + 86400000 * 7).toISOString();
    manager.setExpiry(conv.id, expiry);
    const updated = manager.get(conv.id);
    expect(updated!.expiresAt).toBe(expiry);
  });

  it('clears expiry when set to null', () => {
    const conv = manager.create();
    manager.setExpiry(conv.id, new Date().toISOString());
    manager.setExpiry(conv.id, null);
    const updated = manager.get(conv.id);
    expect(updated!.expiresAt).toBeNull();
  });
});

// ─── updateAfterTurn ────────────────────────────────────────────────────────

describe('ConversationManager — updateAfterTurn()', () => {
  it('increments turn count', () => {
    const conv = manager.create();
    manager.updateAfterTurn(conv.id, 'Hello', 'user');
    const updated = manager.get(conv.id);
    expect(updated!.turnCount).toBe(1);
  });

  it('sets last_message_preview (max 120 chars)', () => {
    const conv = manager.create();
    const longMessage = 'a'.repeat(200);
    manager.updateAfterTurn(conv.id, longMessage, 'assistant');
    const updated = manager.get(conv.id);
    expect(updated!.lastMessagePreview!.length).toBe(120);
  });

  it('auto-titles on first user turn if no auto_title exists', () => {
    const conv = manager.create(); // no message → no auto_title
    manager.updateAfterTurn(conv.id, 'Help me with my Portland contract', 'user');
    const updated = manager.get(conv.id);
    expect(updated!.autoTitle).toBe('Help me with my Portland contract');
  });

  it('does not overwrite existing auto_title on subsequent turns', () => {
    const conv = manager.create('First message here');
    manager.updateAfterTurn(conv.id, 'Second message here', 'user');
    const updated = manager.get(conv.id);
    expect(updated!.autoTitle).toBe('First message here');
  });
});

// ─── clearAll ───────────────────────────────────────────────────────────────

describe('ConversationManager — clearAll()', () => {
  it('deletes all conversations', () => {
    manager.create('A');
    manager.create('B');
    manager.create('C');
    const cleared = manager.clearAll();
    expect(cleared).toBe(3);
    expect(manager.list()).toEqual([]);
  });

  it('preserves pinned conversations when option set', () => {
    const pinned = manager.create('Pinned');
    manager.pin(pinned.id);
    manager.create('Not pinned');

    const cleared = manager.clearAll({ preservePinned: true });
    expect(cleared).toBe(1);
    const remaining = manager.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(pinned.id);
  });
});

// ─── getCount ───────────────────────────────────────────────────────────────

describe('ConversationManager — getCount()', () => {
  it('returns zero counts when empty', () => {
    expect(manager.getCount()).toEqual({ total: 0, pinned: 0 });
  });

  it('counts total and pinned correctly', () => {
    const a = manager.create();
    manager.create();
    manager.pin(a.id);
    expect(manager.getCount()).toEqual({ total: 2, pinned: 1 });
  });
});

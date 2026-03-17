// Tests for NamedSessionManager — session CRUD, resolution, autonomy overrides, channel binding.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NamedSessionManager } from '@semblance/core/agent/named-session-manager.js';
import Database from 'better-sqlite3';

describe('NamedSessionManager', () => {
  let db: Database.Database;
  let manager: NamedSessionManager;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create the conversations table that named_sessions references
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT
      );
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        context_json TEXT,
        actions_json TEXT,
        tokens_prompt INTEGER,
        tokens_completion INTEGER
      );
    `);
    manager = new NamedSessionManager(db as any);
  });

  afterEach(() => {
    db.close();
  });

  describe('createSession', () => {
    it('creates a session with key and label', async () => {
      const convId = await manager.createSession({
        key: 'work:email:main',
        label: 'Work Email',
      });
      expect(convId).toBeTruthy();
      expect(typeof convId).toBe('string');
    });

    it('creates the conversation row in FK table', async () => {
      const convId = await manager.createSession({
        key: 'test:channel:main',
        label: 'Test',
      });
      const row = db.prepare('SELECT id FROM conversations WHERE id = ?').get(convId);
      expect(row).toBeDefined();
    });

    it('normalizes session keys to lowercase', async () => {
      await manager.createSession({ key: 'Work:Email:Main', label: 'Test' });
      const session = await manager.getSession('work:email:main');
      expect(session).not.toBeNull();
    });
  });

  describe('getSession', () => {
    it('returns null for unknown key', async () => {
      expect(await manager.getSession('nonexistent')).toBeNull();
    });

    it('returns full session data', async () => {
      await manager.createSession({
        key: 'personal:imessage:main',
        label: 'Personal iMessage',
        autonomyOverrides: { email: 'guardian' },
        modelOverride: 'qwen3-4b',
        channelBinding: 'imessage:main',
      });

      const session = await manager.getSession('personal:imessage:main');
      expect(session).not.toBeNull();
      expect(session!.label).toBe('Personal iMessage');
      expect(session!.autonomyOverrides).toEqual({ email: 'guardian' });
      expect(session!.modelOverride).toBe('qwen3-4b');
      expect(session!.channelBinding).toBe('imessage:main');
      expect(session!.messageCount).toBe(0);
    });
  });

  describe('listSessions', () => {
    it('returns all sessions', async () => {
      await manager.createSession({ key: 'a:b:c', label: 'A' });
      await manager.createSession({ key: 'd:e:f', label: 'D' });
      const sessions = await manager.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it('orders by lastActiveAt descending', async () => {
      await manager.createSession({ key: 'old:a:b', label: 'Old' });
      await new Promise(r => setTimeout(r, 10));
      await manager.createSession({ key: 'new:a:b', label: 'New' });
      const sessions = await manager.listSessions();
      expect(sessions[0]!.key).toBe('new:a:b');
    });
  });

  describe('deleteSession', () => {
    it('deletes session and conversation', async () => {
      await manager.createSession({ key: 'to-delete:a:b', label: 'Delete' });
      await manager.deleteSession('to-delete:a:b');
      expect(await manager.getSession('to-delete:a:b')).toBeNull();
    });

    it('does not throw for unknown key', async () => {
      await expect(manager.deleteSession('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('resolveSession', () => {
    it('returns existing session conversationId', async () => {
      const created = await manager.createSession({ key: 'work:a:b', label: 'Work' });
      const resolved = await manager.resolveSession('work:a:b');
      expect(resolved).toBe(created);
    });

    it('auto-creates session if not exists', async () => {
      const convId = await manager.resolveSession('auto:created:session');
      expect(convId).toBeTruthy();
      const session = await manager.getSession('auto:created:session');
      expect(session).not.toBeNull();
      expect(session!.label).toBe('Auto Created Session');
    });

    it('updates lastActiveAt on resolve', async () => {
      await manager.createSession({ key: 'ts:a:b', label: 'TS' });
      const before = (await manager.getSession('ts:a:b'))!.lastActiveAt;
      await new Promise(r => setTimeout(r, 10));
      await manager.resolveSession('ts:a:b');
      const after = (await manager.getSession('ts:a:b'))!.lastActiveAt;
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe('autonomy overrides', () => {
    it('getEffectiveTier returns override when set', async () => {
      await manager.createSession({
        key: 'guarded:a:b',
        label: 'Guarded',
        autonomyOverrides: { email: 'guardian' },
      });
      const tier = await manager.getEffectiveTier('guarded:a:b', 'email', 'partner');
      expect(tier).toBe('guardian');
    });

    it('getEffectiveTier falls back to global when no override', async () => {
      await manager.createSession({ key: 'default:a:b', label: 'Default' });
      const tier = await manager.getEffectiveTier('default:a:b', 'email', 'partner');
      expect(tier).toBe('partner');
    });

    it('getEffectiveTier returns global for unknown session', async () => {
      const tier = await manager.getEffectiveTier('nonexistent', 'email', 'partner');
      expect(tier).toBe('partner');
    });
  });

  describe('channel binding', () => {
    it('getSessionByChannel returns session bound to channel', async () => {
      await manager.createSession({
        key: 'personal:telegram:main',
        label: 'Telegram',
        channelBinding: 'telegram:main',
      });
      const session = await manager.getSessionByChannel('telegram:main');
      expect(session).not.toBeNull();
      expect(session!.key).toBe('personal:telegram:main');
    });

    it('getSessionByChannel returns null for unbound channel', async () => {
      expect(await manager.getSessionByChannel('unbound')).toBeNull();
    });
  });

  describe('message counting', () => {
    it('incrementMessageCount updates count', async () => {
      await manager.createSession({ key: 'count:a:b', label: 'Count' });
      manager.incrementMessageCount('count:a:b');
      manager.incrementMessageCount('count:a:b');
      const session = await manager.getSession('count:a:b');
      expect(session!.messageCount).toBe(2);
    });
  });
});

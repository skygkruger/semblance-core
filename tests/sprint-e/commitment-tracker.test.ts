import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CommitmentTracker } from '../../packages/core/agent/commitment-tracker.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

describe('Sprint E — Commitment Tracker', () => {
  let db: Database.Database;
  let tracker: CommitmentTracker;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create the indexed_emails table for commitment detection
    db.exec(`
      CREATE TABLE indexed_emails (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
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
    `);
    tracker = new CommitmentTracker(db as unknown as DatabaseHandle);
  });

  describe('tracked_commitments table', () => {
    it('creates the table on initialization', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_commitments'"
      ).all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('getDueCommitments', () => {
    it('returns empty array when no commitments exist', () => {
      const due = tracker.getDueCommitments();
      expect(due).toEqual([]);
    });

    it('returns due commitments', () => {
      // Insert a commitment directly
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
      db.prepare(`
        INSERT INTO tracked_commitments (id, email_id, thread_id, recipient_id, recipient_name, commitment_text, detected_deadline, implied_deadline, status, resolved_at, created_at)
        VALUES ('c1', 'msg1', 'thread1', 'bob', 'Bob', 'I will send the document', NULL, ?, 'pending', NULL, ?)
      `).run(yesterday, new Date().toISOString());

      const due = tracker.getDueCommitments(1); // due within 1 day
      expect(due).toHaveLength(1);
      expect(due[0]!.commitmentText).toBe('I will send the document');
    });
  });

  describe('resolve', () => {
    it('marks a commitment as resolved', () => {
      db.prepare(`
        INSERT INTO tracked_commitments (id, email_id, thread_id, recipient_id, recipient_name, commitment_text, detected_deadline, implied_deadline, status, resolved_at, created_at)
        VALUES ('c1', 'msg1', 'thread1', 'bob', 'Bob', 'test', NULL, '2026-03-20', 'pending', NULL, ?)
      `).run(new Date().toISOString());

      tracker.resolve('c1');

      const row = db.prepare('SELECT status, resolved_at FROM tracked_commitments WHERE id = ?').get('c1') as { status: string; resolved_at: string };
      expect(row.status).toBe('resolved');
      expect(row.resolved_at).not.toBeNull();
    });
  });

  describe('dismiss', () => {
    it('marks a commitment as dismissed', () => {
      db.prepare(`
        INSERT INTO tracked_commitments (id, email_id, thread_id, recipient_id, recipient_name, commitment_text, detected_deadline, implied_deadline, status, resolved_at, created_at)
        VALUES ('c1', 'msg1', 'thread1', 'bob', 'Bob', 'test', NULL, '2026-03-20', 'pending', NULL, ?)
      `).run(new Date().toISOString());

      tracker.dismiss('c1');

      const row = db.prepare('SELECT status FROM tracked_commitments WHERE id = ?').get('c1') as { status: string };
      expect(row.status).toBe('dismissed');
    });
  });

  describe('detectCommitments (heuristic)', () => {
    it('detects commitment patterns in email snippets', async () => {
      const now = new Date();
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", from_name, "to", subject, snippet, received_at, account_id, indexed_at)
        VALUES ('e1', 'msg_1', 'thread_1', 'me@example.com', 'Me', '["bob@example.com"]', 'Follow up', 'I will send you the document by Friday. Let me know if you need anything else.', ?, 'acc1', ?)
      `).run(now.toISOString(), now.toISOString());

      const commitments = await tracker.detectCommitments(7);
      expect(commitments.length).toBeGreaterThanOrEqual(1);
      expect(commitments[0]!.commitmentText).toContain('send you the document');
    });

    it('does not create duplicate commitments for same email', async () => {
      const now = new Date();
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", from_name, "to", subject, snippet, received_at, account_id, indexed_at)
        VALUES ('e1', 'msg_dup', 'thread_dup', 'me@example.com', 'Me', '["bob@example.com"]', 'Test', 'I will follow up next week.', ?, 'acc1', ?)
      `).run(now.toISOString(), now.toISOString());

      await tracker.detectCommitments(7);
      const second = await tracker.detectCommitments(7);
      expect(second).toHaveLength(0); // No new commitments — already tracked
    });
  });
});

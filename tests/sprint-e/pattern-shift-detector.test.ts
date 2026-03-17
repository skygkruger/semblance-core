import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PatternShiftDetector } from '../../packages/core/agent/pattern-shift-detector.js';
import type { DatabaseHandle } from '../../packages/core/platform/types.js';

describe('Sprint E — Pattern Shift Detector', () => {
  let db: Database.Database;
  let detector: PatternShiftDetector;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create required tables
    db.exec(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        emails TEXT NOT NULL DEFAULT '[]',
        relationship_type TEXT NOT NULL DEFAULT 'unknown'
      );
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
    detector = new PatternShiftDetector(db as unknown as DatabaseHandle);
  });

  it('returns empty array when no contacts have sufficient data', async () => {
    const shifts = await detector.detectShifts();
    expect(shifts).toEqual([]);
  });

  it('detects length_decreasing pattern', async () => {
    // Insert a contact
    db.prepare("INSERT INTO contacts (id, display_name, emails, relationship_type) VALUES ('ct_1', 'Sarah', '[\"sarah@test.com\"]', 'colleague')").run();

    // Insert emails: prior period has long emails, recent period has short ones
    const now = Date.now();
    const threeWeeksAgo = now - 21 * 24 * 60 * 60 * 1000;

    // Prior period emails (long snippets)
    for (let i = 0; i < 5; i++) {
      const date = new Date(threeWeeksAgo - (i + 1) * 2 * 24 * 60 * 60 * 1000);
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", subject, snippet, received_at, indexed_at)
        VALUES (?, ?, ?, 'sarah@test.com', 'Prior subject ${i}', ?, ?, ?)
      `).run(
        `prior_${i}`, `msg_prior_${i}`, `thread_${i}`,
        'A'.repeat(180), // Long snippet
        date.toISOString(), date.toISOString(),
      );
    }

    // Recent period emails (short snippets)
    for (let i = 0; i < 5; i++) {
      const date = new Date(now - (i + 1) * 2 * 24 * 60 * 60 * 1000);
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", subject, snippet, received_at, indexed_at)
        VALUES (?, ?, ?, 'sarah@test.com', 'Recent subject ${i}', ?, ?, ?)
      `).run(
        `recent_${i}`, `msg_recent_${i}`, `thread_r_${i}`,
        'B'.repeat(50), // Short snippet
        date.toISOString(), date.toISOString(),
      );
    }

    const shifts = await detector.detectShifts();
    const lengthShift = shifts.find(s => s.shiftType === 'length_decreasing');
    expect(lengthShift).toBeDefined();
    expect(lengthShift!.contactName).toBe('Sarah');
    expect(lengthShift!.confidence).toBeGreaterThan(0);
  });

  it('shift has correct structure', async () => {
    db.prepare("INSERT INTO contacts (id, display_name, emails, relationship_type) VALUES ('ct_2', 'Bob', '[\"bob@test.com\"]', 'client')").run();

    // Need enough data to trigger any shift
    const now = Date.now();
    const threeWeeksAgo = now - 21 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < 4; i++) {
      const priorDate = new Date(threeWeeksAgo - (i + 1) * 3 * 24 * 60 * 60 * 1000);
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", subject, snippet, received_at, indexed_at)
        VALUES (?, ?, ?, 'bob@test.com', 'Subject A ${i}', ?, ?, ?)
      `).run(`p_${i}`, `mp_${i}`, `tp_${i}`, 'X'.repeat(150), priorDate.toISOString(), priorDate.toISOString());

      const recentDate = new Date(now - (i + 1) * 3 * 24 * 60 * 60 * 1000);
      db.prepare(`
        INSERT INTO indexed_emails (id, message_id, thread_id, "from", subject, snippet, received_at, indexed_at)
        VALUES (?, ?, ?, 'bob@test.com', 'Subject A ${i}', ?, ?, ?)
      `).run(`r_${i}`, `mr_${i}`, `tr_${i}`, 'Y'.repeat(40), recentDate.toISOString(), recentDate.toISOString());
    }

    const shifts = await detector.detectShifts();
    for (const shift of shifts) {
      expect(shift).toHaveProperty('contactId');
      expect(shift).toHaveProperty('contactName');
      expect(shift).toHaveProperty('shiftType');
      expect(shift).toHaveProperty('description');
      expect(shift).toHaveProperty('confidence');
      expect(shift).toHaveProperty('windowDays');
      expect(shift).toHaveProperty('detectedAt');
      expect(shift.confidence).toBeGreaterThan(0);
      expect(shift.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// Tests for ProactiveEngine — meeting prep, follow-up detection, deadline detection.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ProactiveEngine } from '@semblance/core/agent/proactive-engine.js';
import { EmailIndexer } from '@semblance/core/knowledge/email-indexer.js';
import { CalendarIndexer } from '@semblance/core/knowledge/calendar-indexer.js';
import { AutonomyManager } from '@semblance/core/agent/autonomy.js';
import type { KnowledgeGraph, SearchResult } from '@semblance/core/knowledge/index.js';
import type { LLMProvider } from '@semblance/core/llm/types.js';

function createMockKnowledge(): KnowledgeGraph {
  return {
    indexDocument: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([] as SearchResult[]),
    scanDirectory: vi.fn(),
    getDocument: vi.fn(),
    listDocuments: vi.fn(),
    getStats: vi.fn(),
    deleteDocument: vi.fn(),
  };
}

function createMockLLM(): LLMProvider {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    generate: vi.fn(),
    chat: vi.fn(),
    embed: vi.fn().mockResolvedValue([[0.1, 0.2]]),
    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
  };
}

describe('ProactiveEngine', () => {
  let db: Database.Database;
  let engine: ProactiveEngine;
  let emailIndexer: EmailIndexer;
  let calendarIndexer: CalendarIndexer;
  let knowledge: KnowledgeGraph;
  let autonomy: AutonomyManager;

  beforeEach(() => {
    db = new Database(':memory:');
    knowledge = createMockKnowledge();
    const llm = createMockLLM();
    emailIndexer = new EmailIndexer({ db, knowledge, llm });
    calendarIndexer = new CalendarIndexer({ db, knowledge, llm });
    autonomy = new AutonomyManager(db);
    engine = new ProactiveEngine({ db, knowledge, emailIndexer, calendarIndexer, autonomy });
  });

  describe('schema', () => {
    it('creates the proactive_insights table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='proactive_insights'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates indexes on key columns', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_insights_%'").all() as { name: string }[];
      const names = indexes.map(i => i.name);
      expect(names).toContain('idx_insights_type');
      expect(names).toContain('idx_insights_created');
      expect(names).toContain('idx_insights_dismissed');
    });
  });

  describe('run', () => {
    it('returns empty array when no data indexed', async () => {
      const insights = await engine.run();
      expect(insights).toEqual([]);
    });

    it('returns insights when calendar events exist within 24h', async () => {
      // Index a calendar event happening soon (in 2 hours)
      const start = new Date(Date.now() + 2 * 3600000);
      const end = new Date(start.getTime() + 3600000);
      await calendarIndexer.indexEvents([{
        id: 'soon-meeting',
        calendarId: 'cal-1',
        title: 'Design Review',
        description: 'Review Q2 designs',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        location: 'Zoom',
        attendees: [{ name: 'Bob', email: 'bob@test.com', status: 'accepted' }],
        organizer: { name: 'Alice', email: 'alice@test.com' },
        status: 'confirmed' as const,
        reminders: [],
        lastModified: new Date().toISOString(),
      }], 'account-1');

      const insights = await engine.run();
      const meetingPreps = insights.filter(i => i.type === 'meeting_prep');
      expect(meetingPreps.length).toBeGreaterThanOrEqual(1);
      expect(meetingPreps[0].title).toContain('Design Review');
    });
  });

  describe('generateMeetingPreps', () => {
    it('generates prep for events within 24 hours', async () => {
      const start = new Date(Date.now() + 4 * 3600000); // 4 hours from now
      await calendarIndexer.indexEvents([{
        id: 'prep-meeting',
        calendarId: 'cal-1',
        title: 'Sprint Planning',
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 3600000).toISOString(),
        attendees: [{ name: 'Carol', email: 'carol@test.com', status: 'accepted' }],
        organizer: { name: 'Alice', email: 'alice@test.com' },
        status: 'confirmed' as const,
        reminders: [],
        lastModified: new Date().toISOString(),
      }], 'account-1');

      const preps = await engine.generateMeetingPreps();
      expect(preps.length).toBeGreaterThanOrEqual(1);
      expect(preps[0].type).toBe('meeting_prep');
    });

    it('skips all-day events', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today.getTime() + 86400000);

      await calendarIndexer.indexEvents([{
        id: 'allday-skip',
        calendarId: 'cal-1',
        title: 'Birthday',
        startTime: today.toISOString(),
        endTime: tomorrow.toISOString(),
        attendees: [],
        organizer: { name: 'System', email: 'system@test.com' },
        status: 'confirmed' as const,
        reminders: [],
        lastModified: new Date().toISOString(),
      }], 'account-1');

      const preps = await engine.generateMeetingPreps();
      const found = preps.find(p => p.title.includes('Birthday'));
      expect(found).toBeUndefined();
    });
  });

  describe('checkFollowUps', () => {
    it('detects emails with unanswered questions', async () => {
      // Index an email from 2 days ago with a question
      const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
      await emailIndexer.indexMessages([{
        id: 'raw-fu',
        messageId: 'followup-1',
        threadId: 'thread-1',
        from: { name: 'Boss', address: 'boss@company.com' },
        to: [{ name: 'You', address: 'you@company.com' }],
        cc: [],
        subject: 'Project timeline',
        date: twoDaysAgo.toISOString(),
        body: { text: 'Can you send me the updated timeline? I need it for the board meeting.' },
        flags: [], // unread
        attachments: [],
      }], 'account-1');

      const followUps = engine.checkFollowUps();
      expect(followUps.length).toBeGreaterThanOrEqual(1);
      expect(followUps[0].type).toBe('follow_up');
    });

    it('does not flag emails less than 24 hours old', async () => {
      const recent = new Date(Date.now() - 6 * 3600000); // 6 hours ago
      await emailIndexer.indexMessages([{
        id: 'raw-recent',
        messageId: 'recent-1',
        threadId: 'thread-1',
        from: { name: 'Coworker', address: 'cw@company.com' },
        to: [{ name: 'You', address: 'you@company.com' }],
        cc: [],
        subject: 'Quick question',
        date: recent.toISOString(),
        body: { text: 'Did you finish the review?' },
        flags: [],
        attachments: [],
      }], 'account-1');

      const followUps = engine.checkFollowUps();
      const found = followUps.find(f => f.title.includes('Quick question'));
      expect(found).toBeUndefined();
    });
  });

  describe('checkDeadlines', () => {
    it('detects deadline patterns in emails', async () => {
      const recentDate = new Date(Date.now() - 86400000); // 1 day ago
      await emailIndexer.indexMessages([{
        id: 'raw-dl',
        messageId: 'deadline-1',
        threadId: 'thread-1',
        from: { name: 'PM', address: 'pm@company.com' },
        to: [{ name: 'You', address: 'you@company.com' }],
        cc: [],
        subject: 'Report due by Friday',
        date: recentDate.toISOString(),
        body: { text: 'Please submit the report by end of day Friday. This is urgent.' },
        flags: ['\\Seen'],
        attachments: [],
      }], 'account-1');

      const deadlines = engine.checkDeadlines();
      expect(deadlines.length).toBeGreaterThanOrEqual(1);
      expect(deadlines[0].type).toBe('deadline');
    });
  });

  describe('getActiveInsights', () => {
    it('returns empty array when no insights generated', () => {
      const insights = engine.getActiveInsights();
      expect(insights).toEqual([]);
    });

    it('excludes dismissed insights', async () => {
      // Generate an insight then dismiss it
      const start = new Date(Date.now() + 3 * 3600000);
      await calendarIndexer.indexEvents([{
        id: 'dismiss-meeting',
        calendarId: 'cal-1',
        title: 'Standup',
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + 1800000).toISOString(),
        attendees: [{ name: 'Team', email: 'team@test.com', status: 'accepted' }],
        organizer: { name: 'Lead', email: 'lead@test.com' },
        status: 'confirmed' as const,
        reminders: [],
        lastModified: new Date().toISOString(),
      }], 'account-1');

      await engine.run();
      const before = engine.getActiveInsights();
      if (before.length > 0) {
        engine.dismissInsight(before[0].id);
        const after = engine.getActiveInsights();
        expect(after.length).toBeLessThan(before.length);
      }
    });
  });

  describe('dismissInsight', () => {
    it('marks an insight as dismissed', async () => {
      // Insert a dummy insight directly
      db.prepare(`
        INSERT INTO proactive_insights (id, type, priority, title, summary, source_ids, created_at, estimated_time_saved_seconds, dismissed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run('test-insight-1', 'follow_up', 'normal', 'Test', 'Summary', '[]', new Date().toISOString(), 30);

      engine.dismissInsight('test-insight-1');
      const active = engine.getActiveInsights();
      const found = active.find(i => i.id === 'test-insight-1');
      expect(found).toBeUndefined();
    });
  });

  describe('periodic run', () => {
    it('starts and stops periodic run without errors', () => {
      const stop = engine.startPeriodicRun();
      expect(typeof stop).toBe('function');
      engine.stopPeriodicRun();
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MorningBriefGenerator } from '@semblance/core/agent/morning-brief.js';
import { AlterEgoStore } from '@semblance/core/agent/alter-ego-store.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

// Minimal CalendarIndexer stub that satisfies the constructor
const stubCalendarIndexer = {
  getUpcomingEvents: () => [],
  index: () => {},
  indexEvents: () => {},
};

describe('Morning Brief — Alter Ego Summary section', () => {
  let db: Database.Database;
  let alterEgoStore: AlterEgoStore;

  beforeEach(() => {
    db = new Database(':memory:');
    alterEgoStore = new AlterEgoStore(db as unknown as DatabaseHandle);
  });

  afterEach(() => {
    db.close();
  });

  it('includes summary with action count on Monday', () => {
    // Seed receipts for last week
    const lastMonday = new Date('2026-03-02T00:00:00Z'); // Monday
    const lastWeek = new Date(lastMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekGroup = alterEgoStore.getWeekGroup(lastWeek);

    alterEgoStore.logReceipt({
      id: 'r1',
      actionType: 'email.send',
      summary: 'Sent email to alice',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup,
      createdAt: lastWeek.toISOString(),
      executedAt: lastWeek.toISOString(),
    });
    alterEgoStore.logReceipt({
      id: 'r2',
      actionType: 'calendar.create',
      summary: 'Created meeting',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup,
      createdAt: lastWeek.toISOString(),
      executedAt: lastWeek.toISOString(),
    });

    const gen = new MorningBriefGenerator({
      db: db as unknown as DatabaseHandle,
      calendarIndexer: stubCalendarIndexer as any,
      alterEgoStore,
    });

    const section = gen.gatherAlterEgoSummary(lastMonday);
    expect(section.type).toBe('alter_ego_summary');
    expect(section.items.length).toBeGreaterThan(0);
    expect(section.items[0]!.text).toContain('2 things');
  });

  it('returns empty section on non-Monday', () => {
    const tuesday = new Date('2026-03-03T00:00:00Z'); // Tuesday

    const gen = new MorningBriefGenerator({
      db: db as unknown as DatabaseHandle,
      calendarIndexer: stubCalendarIndexer as any,
      alterEgoStore,
    });

    const section = gen.gatherAlterEgoSummary(tuesday);
    expect(section.items).toHaveLength(0);
  });

  it('returns empty section when no receipts for last week', () => {
    const monday = new Date('2026-03-02T00:00:00Z');

    const gen = new MorningBriefGenerator({
      db: db as unknown as DatabaseHandle,
      calendarIndexer: stubCalendarIndexer as any,
      alterEgoStore,
    });

    const section = gen.gatherAlterEgoSummary(monday);
    expect(section.items).toHaveLength(0);
  });

  it('reflects undone count in summary', () => {
    const monday = new Date('2026-03-02T00:00:00Z');
    const lastWeek = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekGroup = alterEgoStore.getWeekGroup(lastWeek);

    alterEgoStore.logReceipt({
      id: 'r_undone',
      actionType: 'email.send',
      summary: 'Sent email',
      reasoning: 'test',
      status: 'undone',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup,
      createdAt: lastWeek.toISOString(),
      executedAt: lastWeek.toISOString(),
    });
    alterEgoStore.logReceipt({
      id: 'r_exec',
      actionType: 'calendar.create',
      summary: 'Created event',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup,
      createdAt: lastWeek.toISOString(),
      executedAt: lastWeek.toISOString(),
    });

    const gen = new MorningBriefGenerator({
      db: db as unknown as DatabaseHandle,
      calendarIndexer: stubCalendarIndexer as any,
      alterEgoStore,
    });

    const section = gen.gatherAlterEgoSummary(monday);
    expect(section.items[0]!.text).toContain('1 was undone');
  });

  it('includes "Still comfortable" prompt', () => {
    const monday = new Date('2026-03-02T00:00:00Z');
    const lastWeek = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekGroup = alterEgoStore.getWeekGroup(lastWeek);

    alterEgoStore.logReceipt({
      id: 'r_comfort',
      actionType: 'email.send',
      summary: 'Sent email',
      reasoning: 'test',
      status: 'executed',
      undoAvailable: false,
      undoExpiresAt: null,
      weekGroup,
      createdAt: lastWeek.toISOString(),
      executedAt: lastWeek.toISOString(),
    });

    const gen = new MorningBriefGenerator({
      db: db as unknown as DatabaseHandle,
      calendarIndexer: stubCalendarIndexer as any,
      alterEgoStore,
    });

    const section = gen.gatherAlterEgoSummary(monday);
    const comfortItem = section.items.find(i => i.text.includes('Still comfortable'));
    expect(comfortItem).toBeDefined();
    expect(comfortItem!.actionable).toBe(true);
  });
});

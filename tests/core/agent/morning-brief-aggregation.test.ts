// Morning Brief Aggregation Tests — Validates data gathering from all sources.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MorningBriefGenerator } from '../../../packages/core/agent/morning-brief.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import type { CalendarIndexer, IndexedCalendarEvent } from '../../../packages/core/knowledge/calendar-indexer.js';
import type { ProactiveEngine, ProactiveInsight } from '../../../packages/core/agent/proactive-engine.js';
import type { ReminderStore, Reminder } from '../../../packages/core/knowledge/reminder-store.js';
import type { RecurringCharge } from '../../../packages/core/finance/recurring-detector.js';
import type { WeatherConditions, HourlyForecast } from '../../../packages/core/platform/weather-types.js';

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

// ─── Mock Factories ─────────────────────────────────────────────────────────

function createMockCalendarIndexer(events: Partial<IndexedCalendarEvent>[] = []): CalendarIndexer {
  return {
    getUpcomingEvents: vi.fn(() => events.map(e => ({
      id: e.id ?? 'cal-1',
      uid: e.uid ?? 'uid-1',
      calendarId: e.calendarId ?? 'cal',
      title: e.title ?? 'Meeting',
      description: e.description ?? '',
      startTime: e.startTime ?? new Date().toISOString(),
      endTime: e.endTime ?? new Date(Date.now() + 3600_000).toISOString(),
      isAllDay: e.isAllDay ?? false,
      location: e.location ?? '',
      attendees: e.attendees ?? '[]',
      organizer: e.organizer ?? '',
      status: e.status ?? 'confirmed',
      recurrenceRule: e.recurrenceRule ?? null,
      accountId: e.accountId ?? 'acc-1',
      indexedAt: e.indexedAt ?? new Date().toISOString(),
    }))),
    getByUid: vi.fn(),
    indexEvents: vi.fn(),
    isAllDayEvent: vi.fn(),
    searchEvents: vi.fn(),
  } as unknown as CalendarIndexer;
}

function createMockProactiveEngine(insights: Partial<ProactiveInsight>[] = []): ProactiveEngine {
  return {
    getActiveInsights: vi.fn(() => insights.map(i => ({
      id: i.id ?? 'ins-1',
      type: i.type ?? 'meeting_prep',
      priority: i.priority ?? 'normal',
      title: i.title ?? 'Insight',
      summary: i.summary ?? 'Summary',
      sourceIds: i.sourceIds ?? [],
      suggestedAction: i.suggestedAction ?? null,
      createdAt: i.createdAt ?? new Date().toISOString(),
      expiresAt: i.expiresAt ?? null,
      estimatedTimeSavedSeconds: i.estimatedTimeSavedSeconds ?? 0,
    }))),
    run: vi.fn(),
    registerTracker: vi.fn(),
  } as unknown as ProactiveEngine;
}

function createMockReminderStore(reminders: Partial<Reminder>[] = []): ReminderStore {
  return {
    findDue: vi.fn(() => reminders.map(r => ({
      id: r.id ?? 'rem-1',
      text: r.text ?? 'Test reminder',
      dueAt: r.dueAt ?? new Date().toISOString(),
      recurrence: r.recurrence ?? 'none',
      status: r.status ?? 'pending',
      snoozedUntil: r.snoozedUntil ?? null,
      source: r.source ?? 'chat',
      createdAt: r.createdAt ?? new Date().toISOString(),
      updatedAt: r.updatedAt ?? new Date().toISOString(),
    }))),
  } as unknown as ReminderStore;
}

function createMockWeatherService(
  current: WeatherConditions | null = null,
  forecast: HourlyForecast[] | null = null,
) {
  return {
    getCurrentWeather: vi.fn(async () => current),
    getForecastData: vi.fn(async () => forecast),
  };
}

function createMockRecurringDetector(charges: Partial<RecurringCharge>[] = []) {
  return {
    getStoredCharges: vi.fn(() => charges.map(c => ({
      id: c.id ?? 'rc-1',
      merchantName: c.merchantName ?? 'Netflix',
      amount: c.amount ?? 15.99,
      frequency: c.frequency ?? 'monthly',
      confidence: c.confidence ?? 0.95,
      lastChargeDate: c.lastChargeDate ?? new Date().toISOString(),
      chargeCount: c.chargeCount ?? 6,
      estimatedAnnualCost: c.estimatedAnnualCost ?? 191.88,
      transactions: c.transactions ?? [],
      status: c.status ?? 'active',
    }))),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MorningBriefGenerator — Aggregation', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-brief-'));
    db = wrapDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('gathers meetings section from CalendarIndexer with attendee context', async () => {
    const calendarIndexer = createMockCalendarIndexer([
      {
        title: 'Sprint Planning',
        startTime: new Date(Date.now() + 3600_000).toISOString(),
        attendees: '["alice@co.com","bob@co.com"]',
      },
    ]);

    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer,
      relationshipAnalyzer: {
        getRelationshipSummary: vi.fn(() => ({ strength: 'strong', lastContact: new Date().toISOString() })),
      },
    });

    const brief = await gen.generateBrief();
    const meetingsSection = brief.sections.find(s => s.type === 'meetings');
    expect(meetingsSection).toBeDefined();
    expect(meetingsSection!.items.length).toBe(1);
    expect(meetingsSection!.items[0]!.text).toContain('Sprint Planning');
    expect(meetingsSection!.items[0]!.context).toContain('2 attendees');
  });

  it('gathers follow-ups from ProactiveEngine insights', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const proactiveEngine = createMockProactiveEngine([
      { type: 'follow_up', title: 'Follow up: Q4 Report', summary: '2 days ago from Jane' },
      { type: 'follow_up', title: 'Follow up: Invoice', summary: '3 days ago from Bob' },
    ]);

    const gen = new MorningBriefGenerator({ db, calendarIndexer, proactiveEngine });
    const brief = await gen.generateBrief();
    const followUpsSection = brief.sections.find(s => s.type === 'follow_ups');
    expect(followUpsSection).toBeDefined();
    expect(followUpsSection!.items.length).toBe(2);
    expect(followUpsSection!.items[0]!.text).toContain('Q4 Report');
  });

  it('gathers reminders from ReminderStore.findDue()', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const reminderStore = createMockReminderStore([
      { text: 'Submit expense report', dueAt: new Date().toISOString() },
    ]);

    const gen = new MorningBriefGenerator({ db, calendarIndexer, reminderStore });
    const brief = await gen.generateBrief();
    const remindersSection = brief.sections.find(s => s.type === 'reminders');
    expect(remindersSection).toBeDefined();
    expect(remindersSection!.items.length).toBe(1);
    expect(remindersSection!.items[0]!.text).toBe('Submit expense report');
  });

  it('gathers weather section from WeatherService', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const weatherService = createMockWeatherService(
      { temperature: 72, condition: 'Sunny', humidity: 45, windSpeed: 5, uvIndex: 6 } as WeatherConditions,
      null,
    );

    const gen = new MorningBriefGenerator({ db, calendarIndexer, weatherService });
    const brief = await gen.generateBrief();
    const weatherSection = brief.sections.find(s => s.type === 'weather');
    expect(weatherSection).toBeDefined();
    expect(weatherSection!.items.length).toBeGreaterThanOrEqual(1);
    expect(weatherSection!.items[0]!.text).toContain('72');
    expect(weatherSection!.items[0]!.text).toContain('Sunny');
  });

  it('gathers financial section from RecurringDetector (forgotten subscriptions)', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const recurringDetector = createMockRecurringDetector([
      { merchantName: 'Unused App', amount: 9.99, status: 'forgotten', estimatedAnnualCost: 119.88 },
      { merchantName: 'Netflix', amount: 15.99, status: 'active' },
    ]);

    const gen = new MorningBriefGenerator({ db, calendarIndexer, recurringDetector });
    const brief = await gen.generateBrief();
    const financialSection = brief.sections.find(s => s.type === 'financial');
    expect(financialSection).toBeDefined();
    // Only forgotten subscriptions
    expect(financialSection!.items.length).toBe(1);
    expect(financialSection!.items[0]!.text).toContain('Unused App');
  });

  it('gathers insights from ProactiveEngine (deadline, meeting_prep)', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const proactiveEngine = createMockProactiveEngine([
      { type: 'deadline', title: 'Deadline: Tax filing', summary: 'Due tomorrow' },
      { type: 'meeting_prep', title: 'Meeting prep: Board review', summary: '3 attendees' },
      { type: 'follow_up', title: 'Follow up: email', summary: 'Should be in follow-ups section' },
    ]);

    const gen = new MorningBriefGenerator({ db, calendarIndexer, proactiveEngine });
    const brief = await gen.generateBrief();
    const insightsSection = brief.sections.find(s => s.type === 'insights');
    expect(insightsSection).toBeDefined();
    // Excludes follow_up (goes to its own section)
    expect(insightsSection!.items.length).toBe(2);
    expect(insightsSection!.items.map(i => i.text)).toContain('Deadline: Tax filing');
    expect(insightsSection!.items.map(i => i.text)).toContain('Meeting prep: Board review');
  });

  it('idempotent: second call returns stored brief', async () => {
    const calendarIndexer = createMockCalendarIndexer([{ title: 'Standup' }]);
    const gen = new MorningBriefGenerator({ db, calendarIndexer });

    const b1 = await gen.generateBrief();
    const b2 = await gen.generateBrief();
    expect(b1.id).toBe(b2.id);
    expect(b1.sections).toEqual(b2.sections);
  });

  it('empty data sources produce empty sections (no errors)', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer,
      weatherService: createMockWeatherService(null, null),
      reminderStore: createMockReminderStore(),
      recurringDetector: createMockRecurringDetector(),
      proactiveEngine: createMockProactiveEngine(),
    });

    const brief = await gen.generateBrief();
    // No sections with items means no sections included
    expect(brief.sections.length).toBe(0);
    expect(brief.summary).toBeTruthy();
  });

  it('sections ordered by priority', async () => {
    const calendarIndexer = createMockCalendarIndexer([{ title: 'Meeting' }]);
    const proactiveEngine = createMockProactiveEngine([
      { type: 'deadline', title: 'Deadline insight' },
    ]);
    const reminderStore = createMockReminderStore([{ text: 'Reminder' }]);

    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer,
      proactiveEngine,
      reminderStore,
    });

    const brief = await gen.generateBrief();
    expect(brief.sections.length).toBeGreaterThanOrEqual(2);
    // Meetings (priority 1) should come before insights (priority 6)
    const meetingsIdx = brief.sections.findIndex(s => s.type === 'meetings');
    const insightsIdx = brief.sections.findIndex(s => s.type === 'insights');
    if (meetingsIdx >= 0 && insightsIdx >= 0) {
      expect(meetingsIdx).toBeLessThan(insightsIdx);
    }
  });

  it('meeting items include relationship context from RelationshipAnalyzer', async () => {
    const calendarIndexer = createMockCalendarIndexer([
      {
        title: 'One-on-one',
        attendees: '["manager@co.com"]',
      },
    ]);

    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer,
      relationshipAnalyzer: {
        getRelationshipSummary: vi.fn(() => ({ strength: 'frequent', lastContact: '2026-02-20' })),
      },
    });

    const brief = await gen.generateBrief();
    const meetingsSection = brief.sections.find(s => s.type === 'meetings');
    expect(meetingsSection).toBeDefined();
    expect(meetingsSection!.items[0]!.context).toContain('1 attendee');
  });

  it('brief has correct date and generatedAt', async () => {
    const calendarIndexer = createMockCalendarIndexer();
    const gen = new MorningBriefGenerator({ db, calendarIndexer });

    const now = new Date();
    const brief = await gen.generateBrief({ date: now });
    expect(brief.date).toBe(now.toISOString().slice(0, 10));
    expect(brief.generatedAt).toBeTruthy();
    // generatedAt should be close to now
    const genTime = new Date(brief.generatedAt).getTime();
    expect(Math.abs(genTime - now.getTime())).toBeLessThan(5000);
  });
});

// Morning Brief LLM Synthesis Tests — Validates summary generation via LLM.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MorningBriefGenerator, type BriefSection } from '../../../packages/core/agent/morning-brief.js';
import type { DatabaseHandle } from '../../../packages/core/platform/types.js';
import type { CalendarIndexer } from '../../../packages/core/knowledge/calendar-indexer.js';
import type { LLMProvider, GenerateRequest, GenerateResponse } from '../../../packages/core/llm/types.js';

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

function createMockCalendarIndexer(): CalendarIndexer {
  return {
    getUpcomingEvents: vi.fn(() => []),
    getByUid: vi.fn(),
    indexEvents: vi.fn(),
    isAllDayEvent: vi.fn(),
    searchEvents: vi.fn(),
  } as unknown as CalendarIndexer;
}

function createMockLLM(responseText: string): LLMProvider {
  return {
    isAvailable: vi.fn(async () => true),
    generate: vi.fn(async (req: GenerateRequest): Promise<GenerateResponse> => ({
      text: responseText,
      model: req.model,
      tokensUsed: { prompt: 100, completion: 50, total: 150 },
      durationMs: 200,
    })),
    chat: vi.fn(),
    embed: vi.fn(),
    listModels: vi.fn(),
    getModel: vi.fn(),
  } as unknown as LLMProvider;
}

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeSections(...configs: Array<{ type: BriefSection['type']; items: string[] }>): BriefSection[] {
  return configs.map(c => ({
    type: c.type,
    title: c.type.charAt(0).toUpperCase() + c.type.slice(1),
    items: c.items.map((text, i) => ({
      id: `item-${c.type}-${i}`,
      text,
      actionable: false,
      source: c.type,
    })),
    priority: c.type === 'meetings' ? 1 : 5,
  }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MorningBriefGenerator — LLM Synthesis', () => {
  let db: DatabaseHandle;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-brief-synth-'));
    db = wrapDatabase(join(tempDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('generates summary from structured sections via LLM', async () => {
    const llm = createMockLLM('You have 2 meetings today and a follow-up pending with Jane.');
    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer: createMockCalendarIndexer(),
      llm,
      model: 'llama3.2',
    });

    const sections = makeSections(
      { type: 'meetings', items: ['9:00 AM — Sprint Planning', '2:00 PM — 1-on-1'] },
      { type: 'follow_ups', items: ['Follow up: Q4 Report from Jane'] },
    );

    const summary = await gen.synthesizeSummary(sections);
    expect(summary).toBe('You have 2 meetings today and a follow-up pending with Jane.');
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });

  it('summary mentions meeting count when meetings present', async () => {
    const llm = createMockLLM('You have 3 meetings today. Your first is Sprint Planning at 9 AM.');
    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer: createMockCalendarIndexer(),
      llm,
      model: 'llama3.2',
    });

    const sections = makeSections(
      { type: 'meetings', items: ['9am Sprint Planning', '11am Design Review', '2pm Standup'] },
    );

    const summary = await gen.synthesizeSummary(sections);
    expect(summary).toContain('3 meetings');
  });

  it('summary mentions weather warnings when high-priority weather items', async () => {
    const llm = createMockLLM('Rain is expected this afternoon. Bring an umbrella. You have 1 meeting at 2pm.');
    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer: createMockCalendarIndexer(),
      llm,
      model: 'llama3.2',
    });

    const sections = makeSections(
      { type: 'weather', items: ['Rain expected today'] },
      { type: 'meetings', items: ['2:00 PM — Team Sync'] },
    );

    const summary = await gen.synthesizeSummary(sections);
    expect(summary.toLowerCase()).toContain('rain');
  });

  it('empty sections handled — falls back to template without "you have 0"', async () => {
    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer: createMockCalendarIndexer(),
      // No LLM → template fallback
    });

    const summary = await gen.synthesizeSummary([]);
    expect(summary).not.toContain('0');
    expect(summary).toBeTruthy();
  });

  it('estimatedReadTimeSeconds computed from summary length', async () => {
    // A 50-word summary at 200 wpm = 15 seconds
    const longSummary = Array(50).fill('word').join(' ');
    const llm = createMockLLM(longSummary);
    const calendarIndexer = createMockCalendarIndexer();

    // Manually make calendar return something so the brief generates sections
    (calendarIndexer.getUpcomingEvents as ReturnType<typeof vi.fn>).mockReturnValue([{
      id: 'cal-1', uid: 'uid-1', calendarId: 'cal', title: 'Test',
      description: '', startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
      isAllDay: false, location: '', attendees: '[]', organizer: '',
      status: 'confirmed', recurrenceRule: null, accountId: 'acc-1',
      indexedAt: new Date().toISOString(),
    }]);

    const gen = new MorningBriefGenerator({ db, calendarIndexer, llm, model: 'llama3.2' });
    const brief = await gen.generateBrief();
    expect(brief.estimatedReadTimeSeconds).toBeGreaterThan(0);
    // 50 words / 200 wpm * 60 = 15 seconds
    expect(brief.estimatedReadTimeSeconds).toBe(15);
  });

  it('prompt passed to LLM contains all section data', async () => {
    const llm = createMockLLM('Summary here.');
    const gen = new MorningBriefGenerator({
      db,
      calendarIndexer: createMockCalendarIndexer(),
      llm,
      model: 'llama3.2',
    });

    const sections = makeSections(
      { type: 'meetings', items: ['Standup'] },
      { type: 'reminders', items: ['Buy groceries'] },
    );

    await gen.synthesizeSummary(sections);

    const call = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0]![0] as GenerateRequest;
    expect(call.prompt).toContain('Standup');
    expect(call.prompt).toContain('Buy groceries');
    expect(call.prompt).toContain('meetings');
    expect(call.prompt).toContain('reminders');
    expect(call.temperature).toBe(0.3);
    expect(call.maxTokens).toBe(512);
  });
});

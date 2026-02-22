// Tests for Commit 9: Mobile Feature Wiring — Step 10 + Step 11 features.
// Web search, web fetch, reminders, quick capture, style-matched drafting.

import { describe, it, expect } from 'vitest';
import {
  toMobileSearchResults,
  toMobileFetchSummary,
  formatSearchAsChat,
} from '../../packages/mobile/src/data/web-search-adapter.js';
import {
  buildReminderNotification,
  calculateSnoozeTime,
  snoozeReminder,
  dismissReminder,
  detectTimeReference,
  getDueReminders,
} from '../../packages/mobile/src/data/reminder-adapter.js';
import type { MobileReminder } from '../../packages/mobile/src/data/reminder-adapter.js';
import {
  computeStyleMatch,
  formatStyleIndicator,
} from '../../packages/mobile/src/data/style-adapter.js';
import type { MobileStyleProfile } from '../../packages/mobile/src/data/style-adapter.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

// ─── Web Search ─────────────────────────────────────────────────────────────

describe('Mobile Wiring — Web Search', () => {
  it('converts search results to mobile format', () => {
    const results = toMobileSearchResults(
      'TypeScript generics',
      [
        { title: 'TS Generics', url: 'https://typescriptlang.org/docs/generics', snippet: 'Learn about generics...' },
        { title: 'Advanced TS', url: 'https://example.com/ts', snippet: 'Advanced TypeScript patterns...' },
      ],
      'brave'
    );

    expect(results.query).toBe('TypeScript generics');
    expect(results.results).toHaveLength(2);
    expect(results.results[0]!.source).toBe('typescriptlang.org');
    expect(results.provider).toBe('brave');
  });

  it('formats search results as chat message', () => {
    const response = toMobileSearchResults(
      'test',
      [{ title: 'Result', url: 'https://example.com', snippet: 'A test result' }],
      'brave'
    );
    const chat = formatSearchAsChat(response);
    expect(chat).toContain('Search results');
    expect(chat).toContain('Result');
  });

  it('handles empty search results', () => {
    const response = toMobileSearchResults('nothing', [], 'brave');
    const chat = formatSearchAsChat(response);
    expect(chat).toContain('No results found');
  });
});

// ─── Web Fetch ──────────────────────────────────────────────────────────────

describe('Mobile Wiring — Web Fetch', () => {
  it('converts fetch result to summary', () => {
    const summary = toMobileFetchSummary('https://example.com/article', {
      title: 'Important Article',
      summary: 'This article discusses several important topics in technology.',
      wordCount: 1500,
    });

    expect(summary.title).toBe('Important Article');
    expect(summary.wordCount).toBe(1500);
    expect(summary.url).toBe('https://example.com/article');
  });

  it('uses domain as fallback title', () => {
    const summary = toMobileFetchSummary('https://example.com/page', {
      summary: 'Some content here.',
    });
    expect(summary.title).toBe('example.com');
  });
});

// ─── Reminders ──────────────────────────────────────────────────────────────

describe('Mobile Wiring — Reminders', () => {
  const baseReminder: MobileReminder = {
    id: 'r1',
    text: 'Call the dentist',
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    source: 'manual',
    snoozeCount: 0,
  };

  it('builds notification from reminder', () => {
    const notif = buildReminderNotification(baseReminder);
    expect(notif.title).toBe('Reminder');
    expect(notif.body).toBe('Call the dentist');
    expect(notif.data.reminderId).toBe('r1');
  });

  it('snooze time escalates: 15m → 1h → 4h', () => {
    expect(calculateSnoozeTime(0)).toBe(15 * 60_000);
    expect(calculateSnoozeTime(1)).toBe(60 * 60_000);
    expect(calculateSnoozeTime(2)).toBe(4 * 60 * 60_000);
    expect(calculateSnoozeTime(5)).toBe(4 * 60 * 60_000);
  });

  it('snoozes a reminder with updated due time', () => {
    const snoozed = snoozeReminder(baseReminder);
    expect(snoozed.status).toBe('snoozed');
    expect(snoozed.snoozeCount).toBe(1);
    expect(new Date(snoozed.dueAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('dismisses a reminder', () => {
    const dismissed = dismissReminder(baseReminder);
    expect(dismissed.status).toBe('dismissed');
  });

  it('detects due reminders', () => {
    const reminders: MobileReminder[] = [
      { ...baseReminder, dueAt: new Date(Date.now() - 60_000).toISOString() }, // Past due
      { ...baseReminder, id: 'r2', dueAt: new Date(Date.now() + 3_600_000).toISOString() }, // Future
      { ...baseReminder, id: 'r3', status: 'completed', dueAt: new Date(Date.now() - 60_000).toISOString() }, // Completed
    ];

    const due = getDueReminders(reminders);
    expect(due).toHaveLength(1);
    expect(due[0]!.id).toBe('r1');
  });
});

// ─── Quick Capture — Time Detection ─────────────────────────────────────────

describe('Mobile Wiring — Quick Capture Time Detection', () => {
  it('detects "tomorrow" in capture text', () => {
    const result = detectTimeReference('Call plumber tomorrow');
    expect(result.hasTime).toBe(true);
    expect(result.suggestedTime).toBeDefined();
    expect(result.suggestedTime!.getHours()).toBe(9);
  });

  it('detects "in X hours"', () => {
    const result = detectTimeReference('Review PR in 2 hours');
    expect(result.hasTime).toBe(true);
    const diff = result.suggestedTime!.getTime() - Date.now();
    // Should be approximately 2 hours (with some tolerance)
    expect(diff).toBeGreaterThan(7_000_000); // > 1h 56m
    expect(diff).toBeLessThan(7_300_000);    // < 2h 2m
  });

  it('detects "at Xpm"', () => {
    const result = detectTimeReference('Meeting at 3pm');
    expect(result.hasTime).toBe(true);
    expect(result.suggestedTime!.getHours()).toBe(15);
  });

  it('returns false for text without time references', () => {
    const result = detectTimeReference('Buy groceries');
    expect(result.hasTime).toBe(false);
    expect(result.suggestedTime).toBeUndefined();
  });
});

// ─── Style-Matched Drafting ─────────────────────────────────────────────────

describe('Mobile Wiring — Style-Matched Drafting', () => {
  const profile: MobileStyleProfile = {
    id: 'p1',
    userName: 'Sky',
    avgSentenceLength: 12,
    avgWordLength: 5,
    formality: 0.6,
    enthusiasm: 0.3,
    verbosity: 0.4,
    greetingStyle: 'Hey',
    signoffStyle: 'Best',
    commonPhrases: ['sounds good', 'let me know'],
    sampleCount: 50,
  };

  it('gives high score for matching draft', () => {
    const draft = 'Hey team,\n\nSounds good, let me check on that and get back to you.\n\nBest,\nSky';
    const result = computeStyleMatch(draft, profile);
    expect(result.score).toBeGreaterThan(70);
    expect(result.grade).toMatch(/^[AB]$/);
  });

  it('gives lower score for mismatched style', () => {
    const draft = 'Dear Sir or Madam,\n\nI am writing to formally request your immediate attention to the aforementioned matter which has been brought to my attention through the proper channels of communication.\n\nYours faithfully,\nSky';
    const result = computeStyleMatch(draft, profile);
    expect(result.score).toBeLessThan(90);
  });

  it('format style indicator for display', () => {
    const result = computeStyleMatch('Hey, sounds good!', profile);
    const display = formatStyleIndicator(result);
    expect(display).toContain('Style:');
    expect(display).toMatch(/\d+%/);
  });
});

// ─── Data Adapter Files ─────────────────────────────────────────────────────

describe('Mobile Wiring — Step 10 + 11 Data Adapters', () => {
  const adapters = [
    'data/web-search-adapter.ts',
    'data/reminder-adapter.ts',
    'data/style-adapter.ts',
  ];

  for (const adapter of adapters) {
    it(`${adapter} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, 'packages/mobile/src', adapter))).toBe(true);
    });
  }
});

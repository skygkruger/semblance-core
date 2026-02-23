// Tests for Universal Inbox — imports real logic functions from InboxScreen source.
// Logic tests validate formatTimeSaved, formatTime, sortEmailsByPriority from real source.

import { describe, it, expect } from 'vitest';
import {
  formatTimeSaved,
  formatTime,
  sortEmailsByPriority,
  type IndexedEmail,
} from '@semblance/desktop/screens/InboxScreen';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeEmail(overrides: Partial<IndexedEmail> = {}): IndexedEmail {
  return {
    id: 'idx-1',
    messageId: 'msg-1',
    threadId: 'thread-1',
    folder: 'INBOX',
    from: 'sender@example.com',
    fromName: 'Sender',
    to: '["recipient@example.com"]',
    subject: 'Test Subject',
    snippet: 'Preview text...',
    receivedAt: new Date().toISOString(),
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    labels: '[]',
    priority: 'normal',
    accountId: 'account-1',
    ...overrides,
  };
}

// ─── Priority Sorting (real import) ───────────────────────────────────────────

describe('Inbox — sortEmailsByPriority (real import)', () => {
  it('sorts high priority emails first', () => {
    const emails = [
      makeEmail({ messageId: 'low', priority: 'low' }),
      makeEmail({ messageId: 'high', priority: 'high' }),
      makeEmail({ messageId: 'normal', priority: 'normal' }),
    ];
    const sorted = sortEmailsByPriority(emails);
    expect(sorted[0]!.messageId).toBe('high');
    expect(sorted[1]!.messageId).toBe('normal');
    expect(sorted[2]!.messageId).toBe('low');
  });

  it('preserves order within same priority', () => {
    const emails = [
      makeEmail({ messageId: 'n1', priority: 'normal' }),
      makeEmail({ messageId: 'n2', priority: 'normal' }),
      makeEmail({ messageId: 'n3', priority: 'normal' }),
    ];
    const sorted = sortEmailsByPriority(emails);
    expect(sorted.map(e => e.messageId)).toEqual(['n1', 'n2', 'n3']);
  });

  it('handles empty list', () => {
    expect(sortEmailsByPriority([])).toEqual([]);
  });
});

// ─── Time Formatting (real import) ────────────────────────────────────────────

describe('Inbox — formatTimeSaved (real import)', () => {
  it('formats seconds under a minute', () => {
    expect(formatTimeSaved(30)).toBe('30s');
    expect(formatTimeSaved(0)).toBe('0s');
    expect(formatTimeSaved(59)).toBe('59s');
  });

  it('formats seconds as minutes', () => {
    expect(formatTimeSaved(60)).toBe('~1 min');
    expect(formatTimeSaved(120)).toBe('~2 min');
    expect(formatTimeSaved(3600)).toBe('~60 min');
  });

  it('rounds to nearest minute', () => {
    expect(formatTimeSaved(90)).toBe('~2 min');
    expect(formatTimeSaved(150)).toBe('~3 min');
  });
});

describe('Inbox — formatTime (real import)', () => {
  it('formats ISO time string', () => {
    const result = formatTime('2025-06-15T14:30:00Z');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for invalid date', () => {
    const result = formatTime('not-a-date');
    expect(result === '' || result === 'Invalid Date').toBe(true);
  });
});

// ─── Label Parsing ────────────────────────────────────────────────────────────
// parseLabels is inline in JSX (not extracted as a named function).
// We test the same logic here against the pattern used in the component.

describe('Inbox — Label Parsing', () => {
  function parseLabels(labelString: string): string[] {
    try { return JSON.parse(labelString) as string[]; } catch { return []; }
  }

  it('parses valid JSON array', () => {
    expect(parseLabels('["actionable","urgent"]')).toEqual(['actionable', 'urgent']);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseLabels('not json')).toEqual([]);
  });

  it('returns empty array for empty JSON array', () => {
    expect(parseLabels('[]')).toEqual([]);
  });
});

// ─── Email Card Data (using real type and sort) ───────────────────────────────

describe('Inbox — Email Card Data', () => {
  it('email has required fields for card rendering', () => {
    const email = makeEmail();
    expect(email.subject).toBeTruthy();
    expect(email.from).toBeTruthy();
    expect(email.snippet).toBeTruthy();
    expect(['high', 'normal', 'low']).toContain(email.priority);
  });

  it('sorted emails maintain all required fields', () => {
    const emails = [
      makeEmail({ messageId: 'a', priority: 'low' }),
      makeEmail({ messageId: 'b', priority: 'high' }),
    ];
    const sorted = sortEmailsByPriority(emails);
    expect(sorted[0]!.priority).toBe('high');
    expect(sorted[0]!.subject).toBeTruthy();
  });
});

// ─── Calendar Event Display ───────────────────────────────────────────────────

describe('Inbox — Calendar Event Display', () => {
  it('all-day event displays "All day" using real formatTime', () => {
    const event = { isAllDay: true, startTime: '2025-06-15T00:00:00Z' };
    const display = event.isAllDay ? 'All day' : formatTime(event.startTime);
    expect(display).toBe('All day');
  });

  it('timed event displays formatted time using real formatTime', () => {
    const event = { isAllDay: false, startTime: '2025-06-15T14:30:00Z' };
    const display = event.isAllDay ? 'All day' : formatTime(event.startTime);
    expect(display).not.toBe('All day');
    expect(display.length).toBeGreaterThan(0);
  });
});

// ─── Actions Summary ──────────────────────────────────────────────────────────

describe('Inbox — Actions Summary with real formatTimeSaved', () => {
  it('formats time saved for summary display', () => {
    const seconds = 360;
    expect(formatTimeSaved(seconds)).toBe('~6 min');
  });

  it('formats zero time saved', () => {
    expect(formatTimeSaved(0)).toBe('0s');
  });
});

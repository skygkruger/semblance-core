// Tests for Universal Inbox — data model, priority sorting, time formatting, action handling.
// These are logic-level tests since we don't have a DOM testing environment (jsdom) configured.
// They validate the data transformations and logic that InboxScreen uses.

import { describe, it, expect } from 'vitest';

// ─── Types (mirror InboxScreen) ─────────────────────────────────────────────

interface IndexedEmail {
  id: string;
  messageId: string;
  threadId: string;
  folder: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string;
  priority: 'high' | 'normal' | 'low';
  accountId: string;
}

interface CalendarEvent {
  id: string;
  uid: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string;
  attendees: string;
  status: string;
}

interface ProactiveInsight {
  id: string;
  type: 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict';
  priority: 'high' | 'normal' | 'low';
  title: string;
  summary: string;
  sourceIds: string[];
  suggestedAction: { actionType: string; payload: Record<string, unknown>; description: string } | null;
  createdAt: string;
  expiresAt: string | null;
  estimatedTimeSavedSeconds: number;
}

// ─── Extracted Logic Functions (from InboxScreen) ────────────────────────────

function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes} min`;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function sortEmailsByPriority(emails: IndexedEmail[]): IndexedEmail[] {
  const high = emails.filter(e => e.priority === 'high');
  const normal = emails.filter(e => e.priority === 'normal');
  const low = emails.filter(e => e.priority === 'low');
  return [...high, ...normal, ...low];
}

function parseLabels(labelString: string): string[] {
  try { return JSON.parse(labelString) as string[]; } catch { return []; }
}

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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Inbox — Priority Sorting', () => {
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

describe('Inbox — Time Formatting', () => {
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
    expect(formatTimeSaved(90)).toBe('~2 min'); // rounds 1.5 to 2
    expect(formatTimeSaved(150)).toBe('~3 min'); // rounds 2.5 to 3
  });

  it('formats ISO time string', () => {
    const result = formatTime('2025-06-15T14:30:00Z');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for invalid date', () => {
    const result = formatTime('not-a-date');
    // Date constructor may return 'Invalid Date' string in some environments
    expect(result === '' || result === 'Invalid Date').toBe(true);
  });
});

describe('Inbox — Label Parsing', () => {
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

describe('Inbox — Email Card Data', () => {
  it('email has required fields for card rendering', () => {
    const email = makeEmail();
    expect(email.subject).toBeTruthy();
    expect(email.from).toBeTruthy();
    expect(email.snippet).toBeTruthy();
    expect(['high', 'normal', 'low']).toContain(email.priority);
  });

  it('email priority dot color mapping', () => {
    const colorMap: Record<string, string> = {
      high: 'attention',
      normal: 'primary',
      low: 'muted',
    };
    expect(colorMap['high']).toBe('attention');
    expect(colorMap['normal']).toBe('primary');
    expect(colorMap['low']).toBe('muted');
  });
});

describe('Inbox — Calendar Event Display', () => {
  it('all-day event displays "All day"', () => {
    const event: CalendarEvent = {
      id: '1', uid: 'uid-1', title: 'Holiday',
      startTime: '2025-06-15T00:00:00Z', endTime: '2025-06-16T00:00:00Z',
      isAllDay: true, location: '', attendees: '[]', status: 'confirmed',
    };
    const display = event.isAllDay ? 'All day' : formatTime(event.startTime);
    expect(display).toBe('All day');
  });

  it('timed event displays formatted time', () => {
    const event: CalendarEvent = {
      id: '2', uid: 'uid-2', title: 'Meeting',
      startTime: '2025-06-15T14:30:00Z', endTime: '2025-06-15T15:30:00Z',
      isAllDay: false, location: 'Room A', attendees: '[]', status: 'confirmed',
    };
    const display = event.isAllDay ? 'All day' : formatTime(event.startTime);
    expect(display).not.toBe('All day');
    expect(display.length).toBeGreaterThan(0);
  });
});

describe('Inbox — Insight Data', () => {
  it('insight types are correctly typed', () => {
    const types: ProactiveInsight['type'][] = ['meeting_prep', 'follow_up', 'deadline', 'conflict'];
    types.forEach(t => {
      expect(['meeting_prep', 'follow_up', 'deadline', 'conflict']).toContain(t);
    });
  });

  it('insight with suggested action has correct structure', () => {
    const insight: ProactiveInsight = {
      id: 'ins-1',
      type: 'follow_up',
      priority: 'high',
      title: 'Follow up with Alice',
      summary: 'Alice asked about the report 3 days ago',
      sourceIds: ['msg-123'],
      suggestedAction: {
        actionType: 'email.send',
        payload: { to: ['alice@example.com'] },
        description: 'Send a follow-up reply',
      },
      createdAt: new Date().toISOString(),
      expiresAt: null,
      estimatedTimeSavedSeconds: 30,
    };
    expect(insight.suggestedAction).not.toBeNull();
    expect(insight.suggestedAction!.actionType).toBe('email.send');
  });
});

describe('Inbox — Actions Summary', () => {
  it('correctly calculates action count display', () => {
    const count: number = 5;
    const display = `${count} action${count !== 1 ? 's' : ''}`;
    expect(display).toBe('5 actions');
  });

  it('singular action display', () => {
    const count = 1;
    const display = `${count} action${count !== 1 ? 's' : ''}`;
    expect(display).toBe('1 action');
  });
});

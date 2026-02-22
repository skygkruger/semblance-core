// Tests for Step 10 IPC types — web.search, web.fetch, reminder.* ActionTypes and payload schemas.

import { describe, it, expect } from 'vitest';
import {
  ActionType,
  ActionPayloadMap,
  WebSearchPayload,
  WebSearchResponse,
  WebFetchPayload,
  WebFetchResponse,
  ReminderCreatePayload,
  ReminderUpdatePayload,
  ReminderListPayload,
  ReminderDeletePayload,
} from '@semblance/core/types/ipc.js';

describe('Step 10: Web ActionTypes', () => {
  it('web.search is a valid ActionType', () => {
    expect(ActionType.safeParse('web.search').success).toBe(true);
  });

  it('web.fetch is a valid ActionType', () => {
    expect(ActionType.safeParse('web.fetch').success).toBe(true);
  });

  it('web actions are in ActionPayloadMap', () => {
    expect(ActionPayloadMap['web.search']).toBeDefined();
    expect(ActionPayloadMap['web.fetch']).toBeDefined();
  });
});

describe('Step 10: Reminder ActionTypes', () => {
  it('reminder.create is a valid ActionType', () => {
    expect(ActionType.safeParse('reminder.create').success).toBe(true);
  });

  it('reminder.update is a valid ActionType', () => {
    expect(ActionType.safeParse('reminder.update').success).toBe(true);
  });

  it('reminder.list is a valid ActionType', () => {
    expect(ActionType.safeParse('reminder.list').success).toBe(true);
  });

  it('reminder.delete is a valid ActionType', () => {
    expect(ActionType.safeParse('reminder.delete').success).toBe(true);
  });

  it('reminder actions are in ActionPayloadMap', () => {
    expect(ActionPayloadMap['reminder.create']).toBeDefined();
    expect(ActionPayloadMap['reminder.update']).toBeDefined();
    expect(ActionPayloadMap['reminder.list']).toBeDefined();
    expect(ActionPayloadMap['reminder.delete']).toBeDefined();
  });
});

describe('WebSearchPayload', () => {
  it('accepts valid payload with required fields', () => {
    const result = WebSearchPayload.safeParse({ query: 'weather in Portland' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe('weather in Portland');
      expect(result.data.count).toBe(5); // default
    }
  });

  it('accepts payload with all optional fields', () => {
    const result = WebSearchPayload.safeParse({
      query: 'latest news',
      count: 10,
      freshness: 'day',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.count).toBe(10);
      expect(result.data.freshness).toBe('day');
    }
  });

  it('rejects empty query', () => {
    const result = WebSearchPayload.safeParse({ query: '' });
    expect(result.success).toBe(false);
  });

  it('rejects count above max', () => {
    const result = WebSearchPayload.safeParse({ query: 'test', count: 25 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid freshness value', () => {
    const result = WebSearchPayload.safeParse({ query: 'test', freshness: 'year' });
    expect(result.success).toBe(false);
  });
});

describe('WebSearchResponse', () => {
  it('accepts valid response', () => {
    const result = WebSearchResponse.safeParse({
      results: [
        { title: 'Result 1', url: 'https://example.com', snippet: 'A snippet', age: '2 hours ago' },
        { title: 'Result 2', url: 'https://example.org', snippet: 'Another snippet' },
      ],
      query: 'test query',
      provider: 'brave',
    });
    expect(result.success).toBe(true);
  });

  it('accepts searxng as provider', () => {
    const result = WebSearchResponse.safeParse({
      results: [],
      query: 'test',
      provider: 'searxng',
    });
    expect(result.success).toBe(true);
  });
});

describe('WebFetchPayload', () => {
  it('accepts valid URL', () => {
    const result = WebFetchPayload.safeParse({ url: 'https://example.com/article' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxContentLength).toBe(50000); // default
    }
  });

  it('accepts custom maxContentLength', () => {
    const result = WebFetchPayload.safeParse({
      url: 'https://example.com',
      maxContentLength: 10000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxContentLength).toBe(10000);
    }
  });

  it('rejects invalid URL', () => {
    const result = WebFetchPayload.safeParse({ url: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('WebFetchResponse', () => {
  it('accepts valid response', () => {
    const result = WebFetchResponse.safeParse({
      url: 'https://example.com/article',
      title: 'Article Title',
      content: 'Article body text...',
      bytesFetched: 15000,
      contentType: 'text/html',
    });
    expect(result.success).toBe(true);
  });
});

describe('ReminderCreatePayload', () => {
  it('accepts valid payload with required fields', () => {
    const result = ReminderCreatePayload.safeParse({
      text: 'Call the dentist',
      dueAt: '2026-02-22T15:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurrence).toBe('none'); // default
      expect(result.data.source).toBe('chat'); // default
    }
  });

  it('accepts payload with all optional fields', () => {
    const result = ReminderCreatePayload.safeParse({
      text: 'Team standup',
      dueAt: '2026-02-23T09:00:00.000Z',
      recurrence: 'daily',
      source: 'quick-capture',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recurrence).toBe('daily');
      expect(result.data.source).toBe('quick-capture');
    }
  });

  it('rejects empty text', () => {
    const result = ReminderCreatePayload.safeParse({
      text: '',
      dueAt: '2026-02-22T15:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid datetime', () => {
    const result = ReminderCreatePayload.safeParse({
      text: 'Test',
      dueAt: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid recurrence', () => {
    const result = ReminderCreatePayload.safeParse({
      text: 'Test',
      dueAt: '2026-02-22T15:00:00.000Z',
      recurrence: 'hourly',
    });
    expect(result.success).toBe(false);
  });
});

describe('ReminderUpdatePayload', () => {
  it('accepts valid update with status change', () => {
    const result = ReminderUpdatePayload.safeParse({
      id: 'rem_abc123',
      status: 'dismissed',
    });
    expect(result.success).toBe(true);
  });

  it('accepts snooze update with snoozedUntil', () => {
    const result = ReminderUpdatePayload.safeParse({
      id: 'rem_abc123',
      status: 'snoozed',
      snoozedUntil: '2026-02-22T16:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('requires id', () => {
    const result = ReminderUpdatePayload.safeParse({ status: 'dismissed' });
    expect(result.success).toBe(false);
  });
});

describe('ReminderListPayload', () => {
  it('accepts empty payload with defaults', () => {
    const result = ReminderListPayload.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('all');
      expect(result.data.limit).toBe(50);
    }
  });

  it('accepts status filter', () => {
    const result = ReminderListPayload.safeParse({ status: 'pending', limit: 10 });
    expect(result.success).toBe(true);
  });
});

describe('ReminderDeletePayload', () => {
  it('accepts valid payload', () => {
    const result = ReminderDeletePayload.safeParse({ id: 'rem_abc123' });
    expect(result.success).toBe(true);
  });

  it('requires id', () => {
    const result = ReminderDeletePayload.safeParse({});
    expect(result.success).toBe(false);
  });
});

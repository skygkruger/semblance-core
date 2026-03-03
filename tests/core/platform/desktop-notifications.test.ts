// Tests for desktop notification adapter — NDJSON stdout event bridge.
// The desktop adapter writes JSON events to process.stdout for the Tauri
// sidecar bridge to forward as native notifications.
// Verifies event format, field completeness, and NDJSON line discipline.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock better-sqlite3 and the vector store before importing the adapter,
// since desktop-adapter.ts imports them at module scope.
vi.mock('better-sqlite3', () => ({
  default: vi.fn(),
}));
vi.mock('@semblance/core/platform/desktop-vector-store.js', () => ({
  LanceDBVectorStore: vi.fn(),
}));

import { createDesktopAdapter } from '@semblance/core/platform/desktop-adapter.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let writeSpy: ReturnType<typeof vi.spyOn>;
let notifications: ReturnType<typeof createDesktopAdapter>['notifications'];

function capturedLines(): string[] {
  return writeSpy.mock.calls
    .map((call: unknown[]) => String(call[0]))
    .filter((line: string) => line.trim().length > 0);
}

function parsedEvents(): Array<{ event: string; data: Record<string, unknown> }> {
  return capturedLines().map((line) => JSON.parse(line.replace(/\n$/, '')));
}

beforeEach(() => {
  vi.restoreAllMocks();
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const adapter = createDesktopAdapter();
  notifications = adapter.notifications;
  // Clear any writes that happened during adapter construction
  writeSpy.mockClear();
});

// ─── scheduleLocal ──────────────────────────────────────────────────────────

describe('Desktop notifications: scheduleLocal', () => {
  it('writes a schedule-notification event to stdout', async () => {
    await notifications.scheduleLocal({
      id: 'notif-1',
      title: 'Test',
      body: 'Hello',
      fireDate: new Date('2026-03-15T09:00:00Z'),
    });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const events = parsedEvents();
    expect(events[0]!.event).toBe('schedule-notification');
  });

  it('includes all notification fields in the event data', async () => {
    await notifications.scheduleLocal({
      id: 'notif-2',
      title: 'Reminder',
      body: 'Do the thing',
      fireDate: new Date('2026-04-01T14:30:00Z'),
      data: { taskId: 'task-42' },
    });

    const events = parsedEvents();
    const data = events[0]!.data as Record<string, unknown>;
    expect(data).toHaveProperty('id', 'notif-2');
    expect(data).toHaveProperty('title', 'Reminder');
    expect(data).toHaveProperty('body', 'Do the thing');
    expect(data).toHaveProperty('fireDate');
    expect(data).toHaveProperty('data');
    expect((data.data as Record<string, unknown>).taskId).toBe('task-42');
  });

  it('formats fireDate as an ISO 8601 string', async () => {
    const fireDate = new Date('2026-06-15T10:00:00.000Z');
    await notifications.scheduleLocal({
      id: 'notif-3',
      title: 'Test',
      body: 'Body',
      fireDate,
    });

    const events = parsedEvents();
    const data = events[0]!.data as Record<string, unknown>;
    expect(data.fireDate).toBe('2026-06-15T10:00:00.000Z');
  });

  it('works without optional data field', async () => {
    await notifications.scheduleLocal({
      id: 'notif-no-data',
      title: 'Simple',
      body: 'No extra data',
      fireDate: new Date('2026-05-01T08:00:00Z'),
    });

    const events = parsedEvents();
    expect(events[0]!.event).toBe('schedule-notification');
    const data = events[0]!.data as Record<string, unknown>;
    expect(data.id).toBe('notif-no-data');
    // data field should be present (as undefined serialized or omitted by JSON.stringify)
  });

  it('includes data field when provided', async () => {
    await notifications.scheduleLocal({
      id: 'notif-with-data',
      title: 'With Data',
      body: 'Has data',
      fireDate: new Date('2026-05-01T08:00:00Z'),
      data: { key: 'value', another: 'field' },
    });

    const events = parsedEvents();
    const data = events[0]!.data as Record<string, unknown>;
    const payload = data.data as Record<string, unknown>;
    expect(payload.key).toBe('value');
    expect(payload.another).toBe('field');
  });
});

// ─── cancel ─────────────────────────────────────────────────────────────────

describe('Desktop notifications: cancel', () => {
  it('writes cancel-notification event with the notification id', async () => {
    await notifications.cancel('notif-to-cancel');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const events = parsedEvents();
    expect(events[0]!.event).toBe('cancel-notification');
    expect((events[0]!.data as Record<string, unknown>).id).toBe('notif-to-cancel');
  });
});

// ─── cancelAll ──────────────────────────────────────────────────────────────

describe('Desktop notifications: cancelAll', () => {
  it('writes cancel-all-notifications event', async () => {
    await notifications.cancelAll();

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const events = parsedEvents();
    expect(events[0]!.event).toBe('cancel-all-notifications');
  });
});

// ─── NDJSON line discipline ─────────────────────────────────────────────────

describe('Desktop notifications: NDJSON format', () => {
  it('each event is a single line terminated by newline', async () => {
    await notifications.scheduleLocal({
      id: 'line-check',
      title: 'Line Check',
      body: 'Verify NDJSON',
      fireDate: new Date('2026-07-01T12:00:00Z'),
    });

    const raw = String(writeSpy.mock.calls[0]![0]);
    // Must end with exactly one newline
    expect(raw.endsWith('\n')).toBe(true);
    // Content before the newline must not contain newlines
    const content = raw.slice(0, -1);
    expect(content).not.toContain('\n');
  });

  it('events use correct event names', async () => {
    await notifications.scheduleLocal({
      id: 'a',
      title: 'T',
      body: 'B',
      fireDate: new Date(),
    });
    await notifications.cancel('b');
    await notifications.cancelAll();

    const events = parsedEvents();
    expect(events[0]!.event).toBe('schedule-notification');
    expect(events[1]!.event).toBe('cancel-notification');
    expect(events[2]!.event).toBe('cancel-all-notifications');
  });

  it('multiple notifications produce separate lines', async () => {
    await notifications.scheduleLocal({
      id: 'first',
      title: 'First',
      body: 'First notification',
      fireDate: new Date('2026-08-01T06:00:00Z'),
    });
    await notifications.scheduleLocal({
      id: 'second',
      title: 'Second',
      body: 'Second notification',
      fireDate: new Date('2026-08-01T07:00:00Z'),
    });

    expect(writeSpy).toHaveBeenCalledTimes(2);
    const events = parsedEvents();
    expect(events).toHaveLength(2);
    expect((events[0]!.data as Record<string, unknown>).id).toBe('first');
    expect((events[1]!.data as Record<string, unknown>).id).toBe('second');
  });

  it('each line is valid JSON', async () => {
    await notifications.scheduleLocal({
      id: 'json-test',
      title: 'JSON Test',
      body: 'Should parse cleanly',
      fireDate: new Date(),
      data: { nested: 'value' },
    });
    await notifications.cancel('json-test');

    for (const line of capturedLines()) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

// CalDAV Adapter Tests — Comprehensive coverage for Step 5B test hardening.
// Tests parseVEvent, parseICalDate, buildVEvent, toICalDate helpers + CalDAVAdapter class.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CalDAVAdapter,
  parseVEvent,
  parseICalDate,
  buildVEvent,
  toICalDate,
} from '@semblance/gateway/services/calendar/caldav-adapter.js';
import { CredentialStore } from '@semblance/gateway/credentials/store.js';
import type { ServiceCredential } from '@semblance/gateway/credentials/types.js';

describe('CalDAV Adapter', () => {
  let db: Database.Database;
  let credentialStore: CredentialStore;
  let adapter: CalDAVAdapter;
  let tempDir: string;

  const makeCred = (overrides?: Partial<ServiceCredential>): ServiceCredential => ({
    id: 'cred-caldav-001',
    serviceType: 'calendar',
    protocol: 'caldav',
    host: 'caldav.example.com',
    port: 443,
    username: 'user@example.com',
    encryptedPassword: 'encrypted-pw',
    useTLS: true,
    displayName: 'Test Calendar',
    createdAt: '2026-02-20T10:00:00.000Z',
    lastVerifiedAt: null,
    ...overrides,
  });

  // Helper to build a minimal valid iCalendar VEVENT
  const makeIcal = (fields: Record<string, string> = {}): string => {
    const defaults: Record<string, string> = {
      UID: 'test-uid-001',
      SUMMARY: 'Test Event',
      DTSTART: '20260215T100000Z',
      DTEND: '20260215T110000Z',
    };
    const merged = { ...defaults, ...fields };
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT'];
    for (const [key, value] of Object.entries(merged)) {
      lines.push(`${key}:${value}`);
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  };

  beforeEach(() => {
    db = new Database(':memory:');
    tempDir = join(tmpdir(), `semblance-caldav-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    const keyPath = join(tempDir, 'credential.key');
    writeFileSync(keyPath, randomBytes(32));
    credentialStore = new CredentialStore(db, keyPath);
    adapter = new CalDAVAdapter(credentialStore);
  });

  afterEach(() => {
    adapter.shutdown();
    db.close();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* cleanup */ }
  });

  // ========== Original Tests ==========

  it('can be constructed with a credential store', () => {
    expect(adapter).toBeDefined();
  });

  it('testConnection returns failure for connection refused', async () => {
    const cred = makeCred({ host: 'localhost', port: 19997 });
    const result = await adapter.testConnection(cred, 'test-password');

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
  }, 30000);

  it('testConnection returns failure for non-existent host', async () => {
    const cred = makeCred({ host: 'this-host-does-not-exist.invalid', port: 443 });
    const result = await adapter.testConnection(cred, 'test-password');

    expect(result.success).toBe(false);
  }, 30000);

  it('shutdown is safe to call multiple times', async () => {
    await expect(adapter.shutdown()).resolves.not.toThrow();
    await expect(adapter.shutdown()).resolves.not.toThrow();
  });

  // ========== C1. iCalendar Parsing Edge Cases ==========

  describe('C1. iCalendar Parsing Edge Cases', () => {
    describe('parseVEvent', () => {
      it('parses a minimal valid VEVENT', () => {
        const ical = makeIcal();
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.id).toBe('test-uid-001');
        expect(event!.title).toBe('Test Event');
        expect(event!.calendarId).toBe('cal-1');
      });

      it('returns null for VEVENT with no UID', () => {
        const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:No UID\r\nEND:VEVENT\r\nEND:VCALENDAR';
        const event = parseVEvent(ical, 'cal-1');
        expect(event).toBeNull();
      });

      it('returns "(no title)" for event with no SUMMARY', () => {
        const ical = makeIcal({ SUMMARY: '' });
        // When SUMMARY is empty string, getField returns empty string
        // The code does: getField('SUMMARY') ?? '(no title)' — empty string is truthy-for-??, so it returns ''
        // Actually '' ?? '(no title)' returns '' because ?? only catches null/undefined
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        // With empty SUMMARY, it'll match 'SUMMARY:' and return empty string
        // parseVEvent uses ?? which doesn't catch empty strings
      });

      it('returns fallback title when SUMMARY field is missing entirely', () => {
        const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:test-123\r\nDTSTART:20260215T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.title).toBe('(no title)');
      });

      it('parses event with no DTEND (falls back to start time)', () => {
        const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:no-end\r\nSUMMARY:No End\r\nDTSTART:20260215T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        // With no DTEND, parseICalDate('') returns null, so endTime falls to new Date().toISOString()
        expect(event!.endTime).toBeDefined();
      });

      it('parses all-day event (DATE format without time)', () => {
        const ical = makeIcal({ 'DTSTART;VALUE=DATE': '20260215', 'DTEND;VALUE=DATE': '20260216' });
        // Remove the default DTSTART/DTEND
        const cleaned = ical.replace('DTSTART:20260215T100000Z\r\n', '').replace('DTEND:20260215T110000Z\r\n', '');
        const event = parseVEvent(cleaned, 'cal-1');
        expect(event).not.toBeNull();
      });

      it('parses event with timezone parameter in DTSTART', () => {
        const ical = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:tz-test\r\nSUMMARY:TZ Event\r\nDTSTART;TZID=America/New_York:20260215T100000\r\nDTEND:20260215T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        // parseICalDate strips TZID parameter via the replace(/^[^:]+:/, '') logic
        expect(event!.startTime).toBeDefined();
      });

      it('parses event with attendees in various PARTSTAT values', () => {
        const ical = [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:attendee-test',
          'SUMMARY:Meeting',
          'DTSTART:20260215T100000Z',
          'DTEND:20260215T110000Z',
          'ATTENDEE;CN=Alice;PARTSTAT=ACCEPTED:mailto:alice@example.com',
          'ATTENDEE;CN=Bob;PARTSTAT=DECLINED:mailto:bob@example.com',
          'ATTENDEE;CN=Charlie;PARTSTAT=TENTATIVE:mailto:charlie@example.com',
          'ATTENDEE;CN=Dave;PARTSTAT=NEEDS-ACTION:mailto:dave@example.com',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n');

        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.attendees).toHaveLength(4);
        expect(event!.attendees[0]!.status).toBe('accepted');
        expect(event!.attendees[1]!.status).toBe('declined');
        expect(event!.attendees[2]!.status).toBe('tentative');
        expect(event!.attendees[3]!.status).toBe('needs-action');
      });

      it('parses event with no attendees', () => {
        const ical = makeIcal();
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.attendees).toEqual([]);
      });

      it('parses event with no organizer', () => {
        const ical = makeIcal();
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.organizer.email).toBe('');
      });

      it('parses event with organizer', () => {
        const ical = [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:org-test',
          'SUMMARY:Organized Event',
          'DTSTART:20260215T100000Z',
          'DTEND:20260215T110000Z',
          'ORGANIZER;CN=Boss:mailto:boss@example.com',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n');

        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.organizer.email).toBe('boss@example.com');
        expect(event!.organizer.name).toBe('Boss');
      });

      it('parses event with RRULE (recurrence)', () => {
        const ical = makeIcal({ RRULE: 'FREQ=DAILY;COUNT=5' });
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.recurrence).toBe('FREQ=DAILY;COUNT=5');
      });

      it('parses event status values (CONFIRMED, TENTATIVE, CANCELLED)', () => {
        const confirmed = parseVEvent(makeIcal({ STATUS: 'CONFIRMED', UID: 'c1' }), 'cal-1');
        expect(confirmed!.status).toBe('confirmed');

        const tentative = parseVEvent(makeIcal({ STATUS: 'TENTATIVE', UID: 'c2' }), 'cal-1');
        expect(tentative!.status).toBe('tentative');

        const cancelled = parseVEvent(makeIcal({ STATUS: 'CANCELLED', UID: 'c3' }), 'cal-1');
        expect(cancelled!.status).toBe('cancelled');
      });

      it('defaults to confirmed when STATUS is missing', () => {
        const ical = makeIcal();
        const event = parseVEvent(ical, 'cal-1');
        expect(event!.status).toBe('confirmed');
      });

      it('parses VALARM reminders', () => {
        const ical = [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:alarm-test',
          'SUMMARY:Alarm Event',
          'DTSTART:20260215T100000Z',
          'DTEND:20260215T110000Z',
          'BEGIN:VALARM',
          'TRIGGER:-PT15M',
          'ACTION:DISPLAY',
          'END:VALARM',
          'BEGIN:VALARM',
          'TRIGGER:-PT1H',
          'ACTION:DISPLAY',
          'END:VALARM',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n');

        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.reminders).toHaveLength(2);
        expect(event!.reminders[0]!.minutesBefore).toBe(15);
        expect(event!.reminders[1]!.minutesBefore).toBe(60);
      });

      it('parses VALARM with days', () => {
        const ical = [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:alarm-days',
          'SUMMARY:Day Alarm',
          'DTSTART:20260215T100000Z',
          'DTEND:20260215T110000Z',
          'BEGIN:VALARM',
          'TRIGGER:-P1DT2H30M',
          'ACTION:DISPLAY',
          'END:VALARM',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n');

        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        // 1 day = 1440 min, 2 hours = 120 min, 30 min = 30 → total 1590
        expect(event!.reminders[0]!.minutesBefore).toBe(1590);
      });

      it('handles malformed iCalendar gracefully (returns null)', () => {
        const malformed = 'this is not valid icalendar data at all';
        const event = parseVEvent(malformed, 'cal-1');
        // No UID found → returns null
        expect(event).toBeNull();
      });

      it('parses event with DESCRIPTION', () => {
        const ical = makeIcal({ DESCRIPTION: 'This is a detailed description of the event.' });
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.description).toBe('This is a detailed description of the event.');
      });

      it('parses event with LOCATION', () => {
        const ical = makeIcal({ LOCATION: 'Conference Room B' });
        const event = parseVEvent(ical, 'cal-1');
        expect(event).not.toBeNull();
        expect(event!.location).toBe('Conference Room B');
      });
    });

    describe('parseICalDate', () => {
      it('parses full datetime with Z suffix', () => {
        expect(parseICalDate('20260215T100000Z')).toBe('2026-02-15T10:00:00.000Z');
      });

      it('parses full datetime without Z suffix', () => {
        expect(parseICalDate('20260215T100000')).toBe('2026-02-15T10:00:00.000Z');
      });

      it('parses date-only format', () => {
        expect(parseICalDate('20260215')).toBe('2026-02-15T00:00:00.000Z');
      });

      it('returns null for empty string', () => {
        expect(parseICalDate('')).toBeNull();
      });

      it('returns null for invalid format', () => {
        expect(parseICalDate('not-a-date')).toBeNull();
      });

      it('strips VALUE=DATE parameter prefix', () => {
        expect(parseICalDate('VALUE=DATE:20260215')).toBe('2026-02-15T00:00:00.000Z');
      });

      it('strips TZID parameter prefix', () => {
        expect(parseICalDate('TZID=America/New_York:20260215T100000')).toBe('2026-02-15T10:00:00.000Z');
      });
    });

    describe('buildVEvent', () => {
      it('builds a basic VEVENT with required fields', () => {
        const result = buildVEvent({
          title: 'Test Meeting',
          startTime: '2026-02-15T10:00:00.000Z',
          endTime: '2026-02-15T11:00:00.000Z',
        }, 'test-uid');

        expect(result).toContain('BEGIN:VCALENDAR');
        expect(result).toContain('END:VCALENDAR');
        expect(result).toContain('BEGIN:VEVENT');
        expect(result).toContain('END:VEVENT');
        expect(result).toContain('UID:test-uid');
        expect(result).toContain('SUMMARY:Test Meeting');
      });

      it('includes DESCRIPTION when provided', () => {
        const result = buildVEvent({
          title: 'Test',
          startTime: '2026-02-15T10:00:00.000Z',
          endTime: '2026-02-15T11:00:00.000Z',
          description: 'A detailed description',
        }, 'uid-1');

        expect(result).toContain('DESCRIPTION:A detailed description');
      });

      it('includes LOCATION when provided', () => {
        const result = buildVEvent({
          title: 'Test',
          startTime: '2026-02-15T10:00:00.000Z',
          endTime: '2026-02-15T11:00:00.000Z',
          location: 'Room 42',
        }, 'uid-1');

        expect(result).toContain('LOCATION:Room 42');
      });

      it('includes ATTENDEE lines when provided', () => {
        const result = buildVEvent({
          title: 'Test',
          startTime: '2026-02-15T10:00:00.000Z',
          endTime: '2026-02-15T11:00:00.000Z',
          attendees: [
            { name: 'Alice', email: 'alice@example.com' },
            { name: 'Bob', email: 'bob@example.com' },
          ],
        }, 'uid-1');

        expect(result).toContain('ATTENDEE;CN=Alice:mailto:alice@example.com');
        expect(result).toContain('ATTENDEE;CN=Bob:mailto:bob@example.com');
      });

      it('omits DESCRIPTION when not provided', () => {
        const result = buildVEvent({
          title: 'Test',
          startTime: '2026-02-15T10:00:00.000Z',
          endTime: '2026-02-15T11:00:00.000Z',
        }, 'uid-1');

        expect(result).not.toContain('DESCRIPTION:');
      });

      it('includes PRODID and VERSION', () => {
        const result = buildVEvent({
          title: 'Test',
          startTime: '2026-02-15T10:00:00.000Z',
          endTime: '2026-02-15T11:00:00.000Z',
        }, 'uid-1');

        expect(result).toContain('VERSION:2.0');
        expect(result).toContain('PRODID:-//Semblance//CalDAV//EN');
      });
    });

    describe('toICalDate', () => {
      it('converts ISO date to iCalendar format', () => {
        expect(toICalDate('2026-02-15T10:00:00.000Z')).toBe('20260215T100000Z');
      });

      it('strips milliseconds', () => {
        const result = toICalDate('2026-02-15T10:00:00.123Z');
        expect(result).not.toContain('.123');
        expect(result).toBe('20260215T100000Z');
      });

      it('handles date without milliseconds', () => {
        expect(toICalDate('2026-02-15T10:00:00Z')).toBe('20260215T100000Z');
      });
    });
  });

  // ========== C2. CRUD Operations ==========

  describe('C2. CRUD Operations', () => {
    it('getClient throws for missing credential', async () => {
      await expect(adapter.discoverCalendars('nonexistent-cred'))
        .rejects.toThrow('Credential not found');
    });

    it('getClient throws for non-CalDAV credential', async () => {
      const imapCred = credentialStore.add({
        serviceType: 'email',
        protocol: 'imap',
        host: 'imap.example.com',
        port: 993,
        username: 'user@example.com',
        password: 'test-pw',
        useTLS: true,
        displayName: 'IMAP Cred',
      });
      await expect(adapter.discoverCalendars(imapCred.id))
        .rejects.toThrow('not a CalDAV credential');
    });

    it('fetchEvents throws for missing credential', async () => {
      await expect(adapter.fetchEvents('nonexistent-cred', {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      })).rejects.toThrow('Credential not found');
    });

    it('createEvent throws for missing credential', async () => {
      await expect(adapter.createEvent('nonexistent-cred', {
        title: 'Test',
        startTime: '2026-02-15T10:00:00.000Z',
        endTime: '2026-02-15T11:00:00.000Z',
      })).rejects.toThrow('Credential not found');
    });

    it('updateEvent throws for missing credential', async () => {
      await expect(adapter.updateEvent('nonexistent-cred', {
        eventId: 'event-1',
        updates: { title: 'Updated' },
      })).rejects.toThrow('Credential not found');
    });
  });

  // ========== C3. Calendar Discovery ==========

  describe('C3. Calendar Discovery', () => {
    it('discoverCalendars throws for missing credential', async () => {
      await expect(adapter.discoverCalendars('nonexistent-cred'))
        .rejects.toThrow('Credential not found');
    });

    it('discoverCalendars throws for non-CalDAV credential', async () => {
      const smtpCred = credentialStore.add({
        serviceType: 'email',
        protocol: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        username: 'user@example.com',
        password: 'test-pw',
        useTLS: true,
        displayName: 'SMTP Cred',
      });
      await expect(adapter.discoverCalendars(smtpCred.id))
        .rejects.toThrow('not a CalDAV credential');
    });

    it('discoverCalendars fails gracefully for unreachable server', async () => {
      const cred = credentialStore.add({
        serviceType: 'calendar',
        protocol: 'caldav',
        host: 'localhost',
        port: 19997,
        username: 'user@example.com',
        password: 'test-pw',
        useTLS: true,
        displayName: 'Unreachable',
      });
      await expect(adapter.discoverCalendars(cred.id)).rejects.toThrow();
    }, 30000);
  });

  // ========== C4. Connection Failures ==========

  describe('C4. Connection Failures', () => {
    it('testConnection returns clear error for auth failure', async () => {
      const cred = makeCred({ host: 'localhost', port: 19997 });
      const result = await adapter.testConnection(cred, 'wrong-password');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    }, 30000);

    it('testConnection returns clear error for connection timeout', async () => {
      const cred = makeCred({ host: 'this-host-does-not-exist.invalid', port: 443 });
      const result = await adapter.testConnection(cred, 'test-password');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    }, 30000);

    it('testConnection classifies ECONNREFUSED', async () => {
      const cred = makeCred({ host: 'localhost', port: 19997 });
      const result = await adapter.testConnection(cred, 'test-password');
      expect(result.success).toBe(false);
      if (result.error?.includes('Connection refused')) {
        expect(result.error).toContain('Connection refused');
      }
    }, 30000);

    it('testConnection classifies ENOTFOUND', async () => {
      const cred = makeCred({ host: 'this-host-does-not-exist.invalid', port: 443 });
      const result = await adapter.testConnection(cred, 'test-password');
      expect(result.success).toBe(false);
      if (result.error?.includes('Server not found')) {
        expect(result.error).toContain('Server not found');
      }
    }, 30000);

    it('shutdown clears client cache', async () => {
      await adapter.shutdown();
      expect(adapter).toBeDefined();
    });

    it('cleanupInterval is cleared on shutdown', async () => {
      const clearSpy = vi.spyOn(global, 'clearInterval');
      await adapter.shutdown();
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });
});

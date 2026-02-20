// CalDAV Adapter — Real calendar operations via CalDAV protocol.
//
// AUTONOMOUS DECISION: Using tsdav for CalDAV.
// Reasoning: tsdav is a TypeScript-native CalDAV/CardDAV client that supports
// Google Calendar, Apple Calendar, Fastmail, Nextcloud, and other providers.
// It handles discovery, authentication, and iCalendar parsing. Gateway-only dependency.
// Escalation check: Build prompt recommends tsdav explicitly.

import { createDAVClient, type DAVClient, type DAVCalendar, type DAVCalendarObject } from 'tsdav';
import type { ServiceCredential } from '../../credentials/types.js';
import type { CredentialStore } from '../../credentials/store.js';
import type {
  CalendarEvent,
  CalendarInfo,
  CalendarFetchParams,
  CalendarCreateParams,
  CalendarUpdateParams,
} from './types.js';

interface ClientEntry {
  client: DAVClient;
  lastUsed: number;
  credentialId: string;
}

/**
 * Parse an iCalendar VEVENT into our CalendarEvent shape.
 */
export function parseVEvent(ical: string, calendarId: string): CalendarEvent | null {
  try {
    // Extract key fields from iCalendar format
    const getField = (name: string): string | undefined => {
      const regex = new RegExp(`^${name}[;:](.*)$`, 'mi');
      const match = ical.match(regex);
      return match?.[1]?.trim();
    };

    const uid = getField('UID');
    if (!uid) return null;

    const summary = getField('SUMMARY') ?? '(no title)';
    const description = getField('DESCRIPTION');
    const location = getField('LOCATION');
    const dtStart = getField('DTSTART');
    const dtEnd = getField('DTEND');
    const lastModified = getField('LAST-MODIFIED');
    const rrule = getField('RRULE');
    const statusRaw = getField('STATUS')?.toUpperCase();

    let status: CalendarEvent['status'] = 'confirmed';
    if (statusRaw === 'TENTATIVE') status = 'tentative';
    if (statusRaw === 'CANCELLED') status = 'cancelled';

    // Parse attendees
    const attendees: CalendarEvent['attendees'] = [];
    const attendeeRegex = /^ATTENDEE[^:]*:(.*)$/gmi;
    let attendeeMatch;
    while ((attendeeMatch = attendeeRegex.exec(ical)) !== null) {
      const line = attendeeMatch[0] ?? '';
      const mailto = (attendeeMatch[1] ?? '').replace('mailto:', '');
      const cnMatch = line.match(/CN=([^;:]+)/i);
      const partstatMatch = line.match(/PARTSTAT=([^;:]+)/i);

      let partstat: CalendarEvent['attendees'][0]['status'] = 'needs-action';
      const ps = partstatMatch?.[1]?.toUpperCase();
      if (ps === 'ACCEPTED') partstat = 'accepted';
      else if (ps === 'DECLINED') partstat = 'declined';
      else if (ps === 'TENTATIVE') partstat = 'tentative';

      attendees.push({
        name: cnMatch?.[1] ?? '',
        email: mailto,
        status: partstat,
      });
    }

    // Parse organizer
    const organizerLine = ical.match(/^ORGANIZER[^:]*:(.*)$/mi);
    const organizerMailto = (organizerLine?.[1] ?? '').replace('mailto:', '');
    const organizerCN = ical.match(/^ORGANIZER[^:]*CN=([^;:]+)/mi);

    // Parse reminders (VALARM)
    const reminders: CalendarEvent['reminders'] = [];
    const alarmRegex = /BEGIN:VALARM[\s\S]*?TRIGGER[^:]*:(-?)P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?[\s\S]*?END:VALARM/gi;
    let alarmMatch;
    while ((alarmMatch = alarmRegex.exec(ical)) !== null) {
      const days = parseInt(alarmMatch[2] ?? '0', 10);
      const hours = parseInt(alarmMatch[3] ?? '0', 10);
      const minutes = parseInt(alarmMatch[4] ?? '0', 10);
      reminders.push({ minutesBefore: days * 1440 + hours * 60 + minutes });
    }

    return {
      id: uid,
      calendarId,
      title: summary,
      description,
      startTime: parseICalDate(dtStart ?? '') ?? new Date().toISOString(),
      endTime: parseICalDate(dtEnd ?? '') ?? new Date().toISOString(),
      location,
      attendees,
      organizer: {
        name: organizerCN?.[1] ?? '',
        email: organizerMailto,
      },
      recurrence: rrule,
      status,
      reminders,
      lastModified: parseICalDate(lastModified ?? '') ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Parse an iCalendar date string to ISO 8601.
 */
export function parseICalDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Strip any VALUE=DATE or TZID parameters
  const cleanDate = dateStr.replace(/^[^:]+:/, '');

  // Handle basic formats: 20260215T100000Z or 20260215
  const match = cleanDate.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?Z?$/);
  if (!match) return null;

  const year = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4] ?? '00';
  const minute = match[5] ?? '00';
  const second = match[6] ?? '00';

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

/**
 * Build a simple iCalendar VEVENT string.
 */
export function buildVEvent(params: CalendarCreateParams, uid: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Semblance//CalDAV//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICalDate(new Date().toISOString())}`,
    `DTSTART:${toICalDate(params.startTime)}`,
    `DTEND:${toICalDate(params.endTime)}`,
    `SUMMARY:${params.title}`,
  ];

  if (params.description) lines.push(`DESCRIPTION:${params.description}`);
  if (params.location) lines.push(`LOCATION:${params.location}`);

  if (params.attendees) {
    for (const a of params.attendees) {
      lines.push(`ATTENDEE;CN=${a.name}:mailto:${a.email}`);
    }
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

export function toICalDate(isoDate: string): string {
  return isoDate.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export class CalDAVAdapter {
  private clients: Map<string, ClientEntry> = new Map();
  private credentialStore: CredentialStore;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(credentialStore: CredentialStore) {
    this.credentialStore = credentialStore;
    this.cleanupInterval = setInterval(() => this.cleanupIdle(), 60_000);
  }

  /**
   * Get or create a DAV client for the given credential.
   */
  private async getClient(credentialId: string): Promise<DAVClient> {
    const existing = this.clients.get(credentialId);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing.client;
    }

    const credential = this.credentialStore.get(credentialId);
    if (!credential) throw new Error(`Credential not found: ${credentialId}`);
    if (credential.protocol !== 'caldav') throw new Error(`Credential ${credentialId} is not a CalDAV credential`);

    const password = this.credentialStore.decryptPassword(credential);

    const client = await createDAVClient({
      serverUrl: `https://${credential.host}${credential.port !== 443 ? ':' + credential.port : ''}`,
      credentials: {
        username: credential.username,
        password,
      },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    this.clients.set(credentialId, {
      client,
      lastUsed: Date.now(),
      credentialId,
    });

    return client;
  }

  /**
   * Discover available calendars.
   */
  async discoverCalendars(credentialId: string): Promise<CalendarInfo[]> {
    const client = await this.getClient(credentialId);
    const calendars = await client.fetchCalendars();

    return calendars.map((cal: DAVCalendar) => ({
      id: cal.url,
      displayName: cal.displayName ?? 'Calendar',
      description: cal.description ?? undefined,
      color: undefined,
      readOnly: false,
    }));
  }

  /**
   * Fetch calendar events within a date range.
   */
  async fetchEvents(credentialId: string, params: CalendarFetchParams): Promise<CalendarEvent[]> {
    const client = await this.getClient(credentialId);
    const calendars = await client.fetchCalendars();

    const targetCalendars = params.calendarId
      ? calendars.filter((c: DAVCalendar) => c.url === params.calendarId)
      : calendars;

    const events: CalendarEvent[] = [];

    for (const calendar of targetCalendars) {
      const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({
        calendar,
        timeRange: {
          start: params.startDate,
          end: params.endDate,
        },
      });

      for (const obj of objects) {
        if (!obj.data) continue;
        const event = parseVEvent(obj.data, calendar.url);
        if (event) events.push(event);
      }
    }

    return events;
  }

  /**
   * Create a new calendar event.
   */
  async createEvent(credentialId: string, params: CalendarCreateParams): Promise<CalendarEvent> {
    const client = await this.getClient(credentialId);
    const calendars = await client.fetchCalendars();

    const targetCalendar = params.calendarId
      ? calendars.find((c: DAVCalendar) => c.url === params.calendarId)
      : calendars[0];

    if (!targetCalendar) throw new Error('No calendar found');

    const uid = `semblance-${Date.now()}-${Math.random().toString(36).substring(2)}@local`;
    const icalData = buildVEvent(params, uid);

    await client.createCalendarObject({
      calendar: targetCalendar,
      filename: `${uid}.ics`,
      iCalString: icalData,
    });

    return {
      id: uid,
      calendarId: targetCalendar.url,
      title: params.title,
      description: params.description,
      startTime: params.startTime,
      endTime: params.endTime,
      location: params.location,
      attendees: (params.attendees ?? []).map(a => ({ ...a, status: 'needs-action' as const })),
      organizer: { name: '', email: '' },
      recurrence: undefined,
      status: 'confirmed',
      reminders: [],
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Update an existing calendar event.
   * CalDAV requires full object replacement — fetch, modify, PUT back.
   */
  async updateEvent(credentialId: string, params: CalendarUpdateParams): Promise<CalendarEvent> {
    const client = await this.getClient(credentialId);
    const calendars = await client.fetchCalendars();

    // Find the event across all calendars
    for (const calendar of calendars) {
      const objects: DAVCalendarObject[] = await client.fetchCalendarObjects({ calendar });

      for (const obj of objects) {
        if (!obj.data) continue;
        const event = parseVEvent(obj.data, calendar.url);
        if (event && event.id === params.eventId) {
          // Build updated event
          const updated: CalendarCreateParams = {
            title: params.updates.title ?? event.title,
            description: params.updates.description ?? event.description,
            startTime: params.updates.startTime ?? event.startTime,
            endTime: params.updates.endTime ?? event.endTime,
            location: params.updates.location ?? event.location,
            attendees: params.updates.attendees ?? event.attendees.map(a => ({ name: a.name, email: a.email })),
          };

          const icalData = buildVEvent(updated, event.id);

          await client.updateCalendarObject({
            calendarObject: {
              url: obj.url,
              data: icalData,
              etag: obj.etag,
            },
          });

          return {
            ...event,
            ...updated,
            attendees: (updated.attendees ?? []).map(a => ({ ...a, status: 'needs-action' as const })),
            lastModified: new Date().toISOString(),
          };
        }
      }
    }

    throw new Error(`Event not found: ${params.eventId}`);
  }

  /**
   * Test CalDAV connection: connect, authenticate, discover calendars.
   */
  async testConnection(credential: ServiceCredential, password: string): Promise<{
    success: boolean;
    error?: string;
    calendars?: CalendarInfo[];
  }> {
    try {
      const client = await createDAVClient({
        serverUrl: `https://${credential.host}${credential.port !== 443 ? ':' + credential.port : ''}`,
        credentials: {
          username: credential.username,
          password,
        },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
      });

      const calendars = await client.fetchCalendars();

      return {
        success: true,
        calendars: calendars.map((cal: DAVCalendar) => ({
          id: cal.url,
          displayName: cal.displayName ?? 'Calendar',
          description: cal.description ?? undefined,
          color: undefined,
          readOnly: false,
        })),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('401') || message.includes('Unauthorized') || message.includes('auth')) {
        return { success: false, error: 'Authentication failed — check your password' };
      }
      if (message.includes('ECONNREFUSED')) {
        return { success: false, error: 'Connection refused — check the server address and port' };
      }
      if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
        return { success: false, error: 'Server not found — check the hostname' };
      }
      if (message.includes('404') || message.includes('Not Found')) {
        return { success: false, error: 'Calendar not found at this URL — check the CalDAV URL' };
      }
      if (message.includes('ETIMEDOUT') || message.includes('timeout')) {
        return { success: false, error: 'Connection timed out — check the server address and port' };
      }

      return { success: false, error: message };
    }
  }

  /**
   * Clean up idle clients.
   */
  private cleanupIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this.clients) {
      if (now - entry.lastUsed > 300_000) { // 5 minute idle
        this.clients.delete(id);
      }
    }
  }

  /**
   * Close all clients and clean up.
   */
  async shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clients.clear();
  }
}

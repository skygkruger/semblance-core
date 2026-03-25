// Calendar Adapter — Unified service adapter for calendar operations.
// Routes calendar.fetch/create/update/delete to CalDAV or Google Calendar REST API.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { CredentialStore } from '../../credentials/store.js';
import type { OAuthTokenManager } from '../oauth-token-manager.js';
import { CalDAVAdapter } from './caldav-adapter.js';
import type { CalendarFetchParams, CalendarCreateParams, CalendarUpdateParams, CalendarDeleteParams } from './types.js';

export class CalendarAdapter implements ServiceAdapter {
  readonly caldav: CalDAVAdapter;
  private credentialStore: CredentialStore;
  private oauthTokenManager: OAuthTokenManager | null;

  constructor(credentialStore: CredentialStore, oauthTokenManager?: OAuthTokenManager) {
    this.credentialStore = credentialStore;
    this.oauthTokenManager = oauthTokenManager ?? null;
    this.caldav = new CalDAVAdapter(credentialStore);
  }

  async execute(action: ActionType, payload: unknown): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    try {
      switch (action) {
        case 'calendar.fetch':
          return await this.handleFetch(payload as CalendarFetchParams);
        case 'calendar.create':
          return await this.handleCreate(payload as CalendarCreateParams);
        case 'calendar.update':
          return await this.handleUpdate(payload as CalendarUpdateParams);
        case 'calendar.delete':
          return await this.handleDelete(payload as CalendarDeleteParams);
        default:
          return {
            success: false,
            error: { code: 'UNSUPPORTED_ACTION', message: `Calendar adapter does not support: ${action}` },
          };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'CALENDAR_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async handleFetch(params: CalendarFetchParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const caldavCreds = this.credentialStore.getByType('calendar')
      .filter(c => c.protocol === 'caldav');

    if (caldavCreds.length === 0) {
      return {
        success: false,
        error: { code: 'NO_CALDAV_CREDENTIALS', message: 'No CalDAV credentials configured' },
      };
    }

    const events = await this.caldav.fetchEvents(caldavCreds[0]!.id, params);
    return { success: true, data: { events } };
  }

  private async handleCreate(params: CalendarCreateParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // Try CalDAV first
    const caldavCreds = this.credentialStore.getByType('calendar')
      .filter(c => c.protocol === 'caldav');

    if (caldavCreds.length > 0) {
      const event = await this.caldav.createEvent(caldavCreds[0]!.id, params);
      return { success: true, data: { event } };
    }

    // No CalDAV — try Google Calendar REST API
    const accessToken = await this.getGoogleCalendarToken();
    if (accessToken) {
      return this.createViaRestApi(accessToken, params);
    }

    return {
      success: false,
      error: { code: 'NO_CALENDAR_CREDENTIALS', message: 'No calendar credentials configured. Connect Google Calendar in Settings.' },
    };
  }

  private async handleUpdate(params: CalendarUpdateParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // Try CalDAV first
    const caldavCreds = this.credentialStore.getByType('calendar')
      .filter(c => c.protocol === 'caldav');

    if (caldavCreds.length > 0) {
      const event = await this.caldav.updateEvent(caldavCreds[0]!.id, params);
      return { success: true, data: { event } };
    }

    // No CalDAV — try Google Calendar REST API
    const accessToken = await this.getGoogleCalendarToken();
    if (accessToken) {
      return this.updateViaRestApi(accessToken, params);
    }

    return {
      success: false,
      error: { code: 'NO_CALENDAR_CREDENTIALS', message: 'No calendar credentials configured. Connect Google Calendar in Settings.' },
    };
  }

  private async handleDelete(params: CalendarDeleteParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    // Google Calendar REST API for delete
    const accessToken = await this.getGoogleCalendarToken();
    if (accessToken) {
      return this.deleteViaRestApi(accessToken, params);
    }

    return {
      success: false,
      error: { code: 'NO_CALENDAR_CREDENTIALS', message: 'No calendar credentials configured. Connect Google Calendar in Settings.' },
    };
  }

  // --- Google Calendar REST API helpers ---

  private async getGoogleCalendarToken(): Promise<string | null> {
    if (!this.oauthTokenManager) return null;

    // Try google-calendar provider first, then shared google token
    let token = await this.oauthTokenManager.getAccessTokenAsync('google-calendar');
    if (!token) {
      token = await this.oauthTokenManager.getAccessTokenAsync('google');
    }
    return token;
  }

  private async createViaRestApi(accessToken: string, params: CalendarCreateParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const calendarId = params.calendarId ?? 'primary';
    const body: Record<string, unknown> = {
      summary: params.title,
      start: { dateTime: params.startTime },
      end: { dateTime: params.endTime },
    };
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;
    if (params.attendees) {
      // Accept both { name, email } objects and plain email strings
      body.attendees = params.attendees.map(a =>
        typeof a === 'string' ? { email: a } : { email: a.email, displayName: a.name }
      );
    }
    if (params.reminders && params.reminders.length > 0) {
      body.reminders = {
        useDefault: false,
        overrides: params.reminders.map(minutes => ({ method: 'popup', minutes })),
      };
    }

    const resp = await globalThis.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (resp.status === 403) {
      return {
        success: false,
        error: {
          code: 'CALENDAR_SCOPE_INSUFFICIENT',
          message: 'Calendar write access not granted. Please disconnect and reconnect Google Calendar in Settings to grant write permissions.',
        },
      };
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        success: false,
        error: { code: 'CALENDAR_CREATE_FAILED', message: `Google Calendar API error (${resp.status}): ${errText.slice(0, 200)}` },
      };
    }

    const event = await resp.json();
    console.error(`[CalendarAdapter] Created event via REST API: ${event.id} — "${event.summary}"`);
    return { success: true, data: { event: { id: event.id, title: event.summary, startTime: event.start?.dateTime, endTime: event.end?.dateTime, htmlLink: event.htmlLink } } };
  }

  private async updateViaRestApi(accessToken: string, params: CalendarUpdateParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const calendarId = params.updates?.calendarId ?? 'primary';
    const body: Record<string, unknown> = {};

    if (params.updates?.title !== undefined) body.summary = params.updates.title;
    if (params.updates?.startTime !== undefined) body.start = { dateTime: params.updates.startTime };
    if (params.updates?.endTime !== undefined) body.end = { dateTime: params.updates.endTime };
    if (params.updates?.description !== undefined) body.description = params.updates.description;
    if (params.updates?.location !== undefined) body.location = params.updates.location;
    if (params.updates?.attendees !== undefined) {
      body.attendees = params.updates.attendees.map(a =>
        typeof a === 'string' ? { email: a } : { email: a.email, displayName: a.name }
      );
    }
    if (params.updates?.reminders !== undefined && params.updates.reminders.length > 0) {
      body.reminders = {
        useDefault: false,
        overrides: params.updates.reminders.map(minutes => ({ method: 'popup', minutes })),
      };
    }

    const resp = await globalThis.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (resp.status === 403) {
      return {
        success: false,
        error: {
          code: 'CALENDAR_SCOPE_INSUFFICIENT',
          message: 'Calendar write access not granted. Please disconnect and reconnect Google Calendar in Settings to grant write permissions.',
        },
      };
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        success: false,
        error: { code: 'CALENDAR_UPDATE_FAILED', message: `Google Calendar API error (${resp.status}): ${errText.slice(0, 200)}` },
      };
    }

    const event = await resp.json();
    console.error(`[CalendarAdapter] Updated event via REST API: ${event.id} — "${event.summary}"`);
    return { success: true, data: { event: { id: event.id, title: event.summary, startTime: event.start?.dateTime, endTime: event.end?.dateTime, htmlLink: event.htmlLink } } };
  }

  private async deleteViaRestApi(accessToken: string, params: CalendarDeleteParams): Promise<{
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  }> {
    const calendarId = params.calendarId ?? 'primary';

    const resp = await globalThis.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(params.eventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (resp.status === 403) {
      return {
        success: false,
        error: {
          code: 'CALENDAR_SCOPE_INSUFFICIENT',
          message: 'Calendar write access not granted. Please disconnect and reconnect Google Calendar in Settings to grant write permissions.',
        },
      };
    }

    // Google returns 204 No Content on successful delete
    if (resp.status === 204 || resp.ok) {
      console.error(`[CalendarAdapter] Deleted event via REST API: ${params.eventId}`);
      return { success: true, data: { deleted: true, eventId: params.eventId } };
    }

    const errText = await resp.text().catch(() => '');
    return {
      success: false,
      error: { code: 'CALENDAR_DELETE_FAILED', message: `Google Calendar API error (${resp.status}): ${errText.slice(0, 200)}` },
    };
  }

  async shutdown(): Promise<void> {
    await this.caldav.shutdown();
  }
}

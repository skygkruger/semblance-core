// Calendar Adapter — Unified service adapter for calendar operations.
// Routes calendar.fetch/create/update to CalDAV.

import type { ActionType } from '@semblance/core';
import type { ServiceAdapter } from '../types.js';
import type { CredentialStore } from '../../credentials/store.js';
import { CalDAVAdapter } from './caldav-adapter.js';
import type { CalendarFetchParams, CalendarCreateParams, CalendarUpdateParams } from './types.js';

export class CalendarAdapter implements ServiceAdapter {
  readonly caldav: CalDAVAdapter;
  private credentialStore: CredentialStore;

  constructor(credentialStore: CredentialStore) {
    this.credentialStore = credentialStore;
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
    const caldavCreds = this.credentialStore.getByType('calendar')
      .filter(c => c.protocol === 'caldav');

    if (caldavCreds.length === 0) {
      return {
        success: false,
        error: { code: 'NO_CALDAV_CREDENTIALS', message: 'No CalDAV credentials configured' },
      };
    }

    const event = await this.caldav.createEvent(caldavCreds[0]!.id, params);
    return { success: true, data: { event } };
  }

  private async handleUpdate(params: CalendarUpdateParams): Promise<{
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

    const event = await this.caldav.updateEvent(caldavCreds[0]!.id, params);
    return { success: true, data: { event } };
  }

  async shutdown(): Promise<void> {
    await this.caldav.shutdown();
  }
}

/**
 * Connector ingress — schema-validates Gateway email/calendar payloads,
 * classifies account/domain provenance, and writes to the vault event log.
 * No live API reads: callers pass already-fetched sync payloads.
 */

import { z } from 'zod';
import type { VaultEventLog } from '../../vault/src/event-log/index.js';
import {
  ingestCalendarEventsToVault,
  ingestEmailMessagesToVault,
  type ConnectorCalendarEventInput,
  type ConnectorEmailMessageInput,
} from '../../vault/src/ingest/connector-ingest.js';

const OAUTH_TOKEN_KEYS = new Set([
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'id_token',
  'idToken',
  'token',
  'oauthToken',
]);

const RecipientSchema = z.object({
  name: z.string(),
  address: z.string().email().or(z.string().min(1)),
});

const ConnectorEmailMessageSchema = z.object({
  id: z.string().min(1).optional(),
  messageId: z.string().min(1),
  threadId: z.string().optional(),
  from: RecipientSchema,
  to: z.array(RecipientSchema).default([]),
  cc: z.array(RecipientSchema).optional(),
  subject: z.string().default(''),
  date: z.string().min(1),
  body: z.object({
    text: z.string().default(''),
    html: z.string().optional(),
  }),
  flags: z.array(z.string()).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        size: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

const ConnectorCalendarEventSchema = z.object({
  id: z.string().min(1),
  calendarId: z.string().min(1),
  title: z.string().default(''),
  description: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  location: z.string().optional(),
  attendees: z
    .array(
      z.object({
        name: z.string(),
        email: z.string().email().or(z.string().min(1)),
        status: z.string(),
      }),
    )
    .default([]),
  organizer: z.object({
    name: z.string(),
    email: z.string().email().or(z.string().min(1)),
  }),
  recurrence: z.string().optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  reminders: z
    .array(z.object({ minutesBefore: z.number().int() }))
    .optional(),
  lastModified: z.string().min(1),
});

export type ConnectorIngressEmailMessage = z.infer<typeof ConnectorEmailMessageSchema>;
export type ConnectorIngressCalendarEvent = z.infer<typeof ConnectorCalendarEventSchema>;

export type ConnectorIngressDomain = 'email' | 'calendar';

export interface ConnectorAccountClassification {
  accountId: string;
  accountEmail: string | null;
  domain: ConnectorIngressDomain;
  sourceType: 'gmail' | 'google_calendar';
}

function stripOAuthTokens(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripOAuthTokens);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (OAUTH_TOKEN_KEYS.has(key)) {
        continue;
      }
      cleaned[key] = stripOAuthTokens(nested);
    }
    return cleaned;
  }
  return value;
}

export function classifyConnectorAccount(params: {
  domain: ConnectorIngressDomain;
  accountId: string;
  accountEmail?: string | null;
}): ConnectorAccountClassification {
  const normalizedAccountId = params.accountId.trim();
  const accountEmail = params.accountEmail?.trim() || null;

  return {
    accountId: normalizedAccountId,
    accountEmail,
    domain: params.domain,
    sourceType: params.domain === 'email' ? 'gmail' : 'google_calendar',
  };
}

export function validateConnectorEmailMessages(raw: unknown): ConnectorEmailMessageInput[] {
  const sanitized = stripOAuthTokens(raw);
  const parsed = z.array(ConnectorEmailMessageSchema).parse(sanitized);

  return parsed.map((message) => ({
    messageId: message.messageId,
    threadId: message.threadId,
    from: message.from,
    to: message.to,
    subject: message.subject,
    date: message.date,
    body: {
      text: message.body.text,
      ...(message.body.html ? { html: message.body.html } : {}),
    },
    flags: message.flags,
    attachments: message.attachments,
  }));
}

export function validateConnectorCalendarEvents(raw: unknown): ConnectorCalendarEventInput[] {
  const sanitized = stripOAuthTokens(raw);
  const parsed = z.array(ConnectorCalendarEventSchema).parse(sanitized);

  return parsed.map((event) => ({
    id: event.id,
    calendarId: event.calendarId,
    title: event.title,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    attendees: event.attendees,
    organizer: event.organizer,
    status: event.status,
    lastModified: event.lastModified,
  }));
}

export interface IngressConnectorEmailParams {
  messages: unknown;
  accountId: string;
  accountEmail?: string | null;
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  indexedEmailIdForMessage?: (message: ConnectorEmailMessageInput) => string;
  existingEventIds?: Set<string>;
}

export interface IngressConnectorCalendarParams {
  events: unknown;
  accountId: string;
  accountEmail?: string | null;
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  indexedEventIdForEvent?: (event: ConnectorCalendarEventInput) => string;
  existingEventIds?: Set<string>;
}

export function ingressConnectorEmailMessages(params: IngressConnectorEmailParams): {
  classification: ConnectorAccountClassification;
  messages: ConnectorEmailMessageInput[];
  ingested: number;
  skipped: number;
} {
  const classification = classifyConnectorAccount({
    domain: 'email',
    accountId: params.accountId,
    accountEmail: params.accountEmail,
  });
  const messages = validateConnectorEmailMessages(params.messages);
  const result = ingestEmailMessagesToVault({
    messages,
    accountId: classification.accountId,
    indexedEmailIdForMessage: params.indexedEmailIdForMessage,
    eventLog: params.eventLog,
    deviceId: params.deviceId,
    membershipEpoch: params.membershipEpoch,
    existingEventIds: params.existingEventIds,
  });

  return {
    classification,
    messages,
    ingested: result.ingested,
    skipped: result.skipped,
  };
}

export function ingressConnectorCalendarEvents(params: IngressConnectorCalendarParams): {
  classification: ConnectorAccountClassification;
  events: ConnectorCalendarEventInput[];
  ingested: number;
  skipped: number;
} {
  const classification = classifyConnectorAccount({
    domain: 'calendar',
    accountId: params.accountId,
    accountEmail: params.accountEmail,
  });
  const events = validateConnectorCalendarEvents(params.events);
  const result = ingestCalendarEventsToVault({
    events,
    accountId: classification.accountId,
    indexedEventIdForEvent: params.indexedEventIdForEvent,
    eventLog: params.eventLog,
    deviceId: params.deviceId,
    membershipEpoch: params.membershipEpoch,
    existingEventIds: params.existingEventIds,
  });

  return {
    classification,
    events,
    ingested: result.ingested,
    skipped: result.skipped,
  };
}

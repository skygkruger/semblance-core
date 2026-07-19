import { createHash } from 'node:crypto';
import type { SensitivityLevel } from '@semblance/protocol';
import type { VaultEventLog } from '../event-log/index.js';
import { VaultEventLogError } from '../event-log/errors.js';
import type { VaultEventLogWriter } from '../event-log/writer.js';
import { createSourceRef } from '../provenance/source-ref.js';

/** Matches @semblance/core VaultConnectorEmailIndexedParams — kept local to avoid vault→core dependency. */
export interface VaultConnectorEmailIndexedParams {
  message: ConnectorEmailMessageInput;
  accountId: string;
  indexedEmailId: string;
  occurredAt?: string;
}

/** Matches @semblance/core VaultConnectorCalendarIndexedParams — kept local to avoid vault→core dependency. */
export interface VaultConnectorCalendarIndexedParams {
  event: ConnectorCalendarEventInput;
  accountId: string;
  indexedEventId: string;
  occurredAt?: string;
}

export interface VaultConnectorIngestHooks {
  onEmailIndexed(params: VaultConnectorEmailIndexedParams): void | Promise<void>;
  onCalendarEventIndexed(params: VaultConnectorCalendarIndexedParams): void | Promise<void>;
}

export interface ConnectorEmailMessageInput {
  messageId: string;
  threadId?: string;
  from: { name: string; address: string };
  to: Array<{ name: string; address: string }>;
  subject: string;
  date: string;
  body: { text: string; html?: string };
  flags?: string[];
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
}

export interface ConnectorCalendarEventInput {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: Array<{ name: string; email: string; status: string }>;
  organizer: { name: string; email: string };
  status: 'confirmed' | 'tentative' | 'cancelled';
  lastModified: string;
}

export function buildEmailSourceId(accountId: string, messageId: string): string {
  return `email:${accountId}:${messageId}`;
}

export function buildCalendarSourceId(accountId: string, eventId: string): string {
  return `calendar:${accountId}:${eventId}`;
}

export function buildEmailSourceUri(accountId: string, messageId: string): string {
  return `gmail://${encodeURIComponent(accountId)}/${encodeURIComponent(messageId)}`;
}

export function buildCalendarSourceUri(accountId: string, eventId: string): string {
  return `google_calendar://${encodeURIComponent(accountId)}/${encodeURIComponent(eventId)}`;
}

function buildConnectorIngestEventId(prefix: string, accountId: string, recordId: string): string {
  const digest = createHash('sha256')
    .update(`${prefix}|${accountId}|${recordId}`, 'utf-8')
    .digest('hex')
    .slice(0, 32);
  return `${prefix}-${digest}`;
}

export function buildEmailIngestEventId(accountId: string, messageId: string): string {
  return buildConnectorIngestEventId('vault-email-ingest-v1', accountId, messageId);
}

export function buildCalendarIngestEventId(accountId: string, eventId: string): string {
  return buildConnectorIngestEventId('vault-calendar-ingest-v1', accountId, eventId);
}

function buildEmailSnippet(bodyText: string): string {
  return bodyText.substring(0, 200).replace(/\s+/g, ' ').trim();
}

export function buildEmailIngestPayload(params: {
  message: ConnectorEmailMessageInput;
  accountId: string;
  indexedEmailId: string;
}): Record<string, unknown> {
  const snippet = buildEmailSnippet(params.message.body.text ?? '');
  return {
    schemaVersion: 1,
    documentId: params.indexedEmailId,
    title: params.message.subject || '(No subject)',
    mimeType: 'message/rfc822',
    messageId: params.message.messageId,
    snippet,
    from: params.message.from.address,
    fromName: params.message.from.name,
    receivedAt: params.message.date,
    accountId: params.accountId,
    connectorDomain: 'email',
  };
}

export function buildCalendarIngestPayload(params: {
  event: ConnectorCalendarEventInput;
  accountId: string;
  indexedEventId: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    documentId: params.indexedEventId,
    title: params.event.title || '(No title)',
    mimeType: 'text/calendar',
    eventId: params.event.id,
    accountId: params.accountId,
    connectorDomain: 'calendar',
    startTime: params.event.startTime,
    endTime: params.event.endTime,
    organizer: params.event.organizer.email,
  };
}

export interface IngestEmailMessageToVaultParams {
  message: ConnectorEmailMessageInput;
  accountId: string;
  indexedEmailId: string;
  writer: VaultEventLogWriter;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  occurredAt?: string;
  existingEventIds?: Set<string>;
}

export interface IngestEmailMessageToVaultResult {
  eventId: string;
  sourceId: string;
  skipped: boolean;
}

export function ingestEmailMessageToVault(
  params: IngestEmailMessageToVaultParams,
): IngestEmailMessageToVaultResult {
  const eventId = buildEmailIngestEventId(params.accountId, params.message.messageId);
  const sourceId = buildEmailSourceId(params.accountId, params.message.messageId);

  if (params.existingEventIds?.has(eventId)) {
    return { eventId, sourceId, skipped: true };
  }

  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const sourceRef = createSourceRef({
    sourceId,
    sourceType: 'gmail',
    uri: buildEmailSourceUri(params.accountId, params.message.messageId),
    ingestedAt: occurredAt,
  });

  try {
    params.writer.append({
      eventId,
      dataDomain: 'documents',
      deviceId: params.deviceId,
      membershipEpoch: params.membershipEpoch,
      eventType: 'source_ingested',
      sourceRefs: [sourceRef],
      sensitivity: params.sensitivity ?? 'personal',
      occurredAt,
      payloadPlaintext: JSON.stringify(
        buildEmailIngestPayload({
          message: params.message,
          accountId: params.accountId,
          indexedEmailId: params.indexedEmailId,
        }),
      ),
    });
  } catch (error) {
    if (error instanceof VaultEventLogError && error.code === 'DUPLICATE_EVENT_ID') {
      params.existingEventIds?.add(eventId);
      return { eventId, sourceId, skipped: true };
    }
    throw error;
  }

  params.existingEventIds?.add(eventId);
  return { eventId, sourceId, skipped: false };
}

export interface IngestEmailMessagesToVaultParams {
  messages: ConnectorEmailMessageInput[];
  accountId: string;
  indexedEmailIdForMessage?: (message: ConnectorEmailMessageInput) => string;
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  existingEventIds?: Set<string>;
}

export function ingestEmailMessagesToVault(params: IngestEmailMessagesToVaultParams): {
  ingested: number;
  skipped: number;
  results: IngestEmailMessageToVaultResult[];
} {
  const results: IngestEmailMessageToVaultResult[] = [];
  let ingested = 0;
  let skipped = 0;
  const resolveIndexedId = params.indexedEmailIdForMessage
    ?? ((message: ConnectorEmailMessageInput) => message.messageId);

  for (const message of params.messages) {
    const result = ingestEmailMessageToVault({
      message,
      accountId: params.accountId,
      indexedEmailId: resolveIndexedId(message),
      writer: params.eventLog.writer,
      deviceId: params.deviceId,
      membershipEpoch: params.membershipEpoch,
      sensitivity: params.sensitivity,
      existingEventIds: params.existingEventIds,
    });
    results.push(result);
    if (result.skipped) {
      skipped += 1;
    } else {
      ingested += 1;
    }
  }

  return { ingested, skipped, results };
}

export interface IngestCalendarEventToVaultParams {
  event: ConnectorCalendarEventInput;
  accountId: string;
  indexedEventId: string;
  writer: VaultEventLogWriter;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  occurredAt?: string;
  existingEventIds?: Set<string>;
}

export interface IngestCalendarEventToVaultResult {
  eventId: string;
  sourceId: string;
  skipped: boolean;
}

export function ingestCalendarEventToVault(
  params: IngestCalendarEventToVaultParams,
): IngestCalendarEventToVaultResult {
  const eventId = buildCalendarIngestEventId(params.accountId, params.event.id);
  const sourceId = buildCalendarSourceId(params.accountId, params.event.id);

  if (params.existingEventIds?.has(eventId)) {
    return { eventId, sourceId, skipped: true };
  }

  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const sourceRef = createSourceRef({
    sourceId,
    sourceType: 'google_calendar',
    uri: buildCalendarSourceUri(params.accountId, params.event.id),
    ingestedAt: occurredAt,
  });

  try {
    params.writer.append({
      eventId,
      dataDomain: 'documents',
      deviceId: params.deviceId,
      membershipEpoch: params.membershipEpoch,
      eventType: 'source_ingested',
      sourceRefs: [sourceRef],
      sensitivity: params.sensitivity ?? 'personal',
      occurredAt,
      payloadPlaintext: JSON.stringify(
        buildCalendarIngestPayload({
          event: params.event,
          accountId: params.accountId,
          indexedEventId: params.indexedEventId,
        }),
      ),
    });
  } catch (error) {
    if (error instanceof VaultEventLogError && error.code === 'DUPLICATE_EVENT_ID') {
      params.existingEventIds?.add(eventId);
      return { eventId, sourceId, skipped: true };
    }
    throw error;
  }

  params.existingEventIds?.add(eventId);
  return { eventId, sourceId, skipped: false };
}

export interface IngestCalendarEventsToVaultParams {
  events: ConnectorCalendarEventInput[];
  accountId: string;
  indexedEventIdForEvent?: (event: ConnectorCalendarEventInput) => string;
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  existingEventIds?: Set<string>;
}

export function ingestCalendarEventsToVault(params: IngestCalendarEventsToVaultParams): {
  ingested: number;
  skipped: number;
  results: IngestCalendarEventToVaultResult[];
} {
  const results: IngestCalendarEventToVaultResult[] = [];
  let ingested = 0;
  let skipped = 0;
  const resolveIndexedId = params.indexedEventIdForEvent
    ?? ((event: ConnectorCalendarEventInput) => event.id);

  for (const event of params.events) {
    const result = ingestCalendarEventToVault({
      event,
      accountId: params.accountId,
      indexedEventId: resolveIndexedId(event),
      writer: params.eventLog.writer,
      deviceId: params.deviceId,
      membershipEpoch: params.membershipEpoch,
      sensitivity: params.sensitivity,
      existingEventIds: params.existingEventIds,
    });
    results.push(result);
    if (result.skipped) {
      skipped += 1;
    } else {
      ingested += 1;
    }
  }

  return { ingested, skipped, results };
}

export interface CreateVaultConnectorIngestHooksOptions {
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  existingEventIds?: Set<string>;
}

export function createVaultConnectorIngestHooks(
  options: CreateVaultConnectorIngestHooksOptions,
): VaultConnectorIngestHooks {
  const existingEventIds = options.existingEventIds ?? new Set<string>();

  return {
    onEmailIndexed(params: VaultConnectorEmailIndexedParams): void {
      ingestEmailMessageToVault({
        message: params.message,
        accountId: params.accountId,
        indexedEmailId: params.indexedEmailId,
        writer: options.eventLog.writer,
        deviceId: options.deviceId,
        membershipEpoch: options.membershipEpoch,
        sensitivity: options.sensitivity,
        occurredAt: params.occurredAt,
        existingEventIds,
      });
    },

    onCalendarEventIndexed(params: VaultConnectorCalendarIndexedParams): void {
      ingestCalendarEventToVault({
        event: params.event,
        accountId: params.accountId,
        indexedEventId: params.indexedEventId,
        writer: options.eventLog.writer,
        deviceId: options.deviceId,
        membershipEpoch: options.membershipEpoch,
        sensitivity: options.sensitivity,
        occurredAt: params.occurredAt,
        existingEventIds,
      });
    },
  };
}

import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCalendarSourceId,
  buildEmailSourceId,
  createEventLog,
  ingestCalendarEventsToVault,
  ingestEmailMessagesToVault,
  listVaultConnectedSources,
  readDecryptedEvents,
  type ConnectorCalendarEventInput,
  type ConnectorEmailMessageInput,
} from '../src/index.js';
import {
  ingressConnectorCalendarEvents,
  ingressConnectorEmailMessages,
} from '../../gateway/ingress/connector-ingress.js';

const ROOT_KEY = randomBytes(32);
const NOW_MS = Date.parse('2026-07-18T14:00:00.000Z');
const DEVICE_ID = 'device-connector-ingest-001';
const ACCOUNT_ID = 'acct-user@example.com';

function createVaultGrant(): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-connector-ingest',
    principalId: 'principal-connector-ingest',
    deviceId: DEVICE_ID,
    processId: 'core-connector-ingest',
    sessionId: 'session-connector-ingest',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-connector-ingest',
    consentReceiptId: 'receipt-connector-ingest',
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Vault connector ingest tests',
    dataScope: {
      domains: ['documents', 'email', 'calendar'],
      accounts: [ACCOUNT_ID],
      sources: ['gmail', 'google_calendar'],
      recordClasses: ['event'],
    },
    constraints: {
      domains: ['documents', 'email', 'calendar'],
      resultLimit: 200,
      sensitivityCeiling: 'restricted',
    },
    issuedAt: '2026-07-18T13:00:00.000Z',
    expiresAt: '2026-07-18T15:00:00.000Z',
    policyEpoch: 3,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-connector-ingest',
    signature: 'ed25519:capability-signature-base64',
  };
}

function buildEmailFixtures(count: number): ConnectorEmailMessageInput[] {
  return Array.from({ length: count }, (_, index) => ({
    messageId: `msg-${String(index + 1).padStart(3, '0')}`,
    threadId: `thread-${index + 1}`,
    from: { name: 'Sender', address: 'sender@example.com' },
    to: [{ name: 'User', address: ACCOUNT_ID }],
    subject: `Fixture subject ${index + 1}`,
    date: new Date(Date.parse('2026-07-01T12:00:00.000Z') + index * 60_000).toISOString(),
    body: {
      text: `Fixture body for message ${index + 1}.`,
    },
    flags: ['\\Seen'],
    attachments: [],
  }));
}

function buildCalendarFixtures(count: number): ConnectorCalendarEventInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `evt-${String(index + 1).padStart(3, '0')}`,
    calendarId: 'primary',
    title: `Fixture event ${index + 1}`,
    description: `Description ${index + 1}`,
    startTime: new Date(Date.parse('2026-07-10T09:00:00.000Z') + index * 3_600_000).toISOString(),
    endTime: new Date(Date.parse('2026-07-10T10:00:00.000Z') + index * 3_600_000).toISOString(),
    location: 'Remote',
    attendees: [{ name: 'User', email: ACCOUNT_ID, status: 'accepted' }],
    organizer: { name: 'Organizer', email: 'organizer@example.com' },
    status: 'confirmed' as const,
    lastModified: new Date(Date.parse('2026-07-09T08:00:00.000Z') + index * 60_000).toISOString(),
  }));
}

describe('vault connector ingest', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function openVault() {
    const dir = mkdtempSync(join(tmpdir(), 'semblance-connector-ingest-vault-'));
    tempDirs.push(dir);
    const db = new Database(join(dir, 'vault-events.db'));
    const log = createEventLog({
      db,
      rootKey: ROOT_KEY,
      writerId: randomBytes(8).toString('hex'),
    });
    return { db, log };
  }

  it('ingests 50 email messages and 10 calendar events with stable source IDs and no OAuth tokens', () => {
    const emailFixtures = buildEmailFixtures(50);
    const calendarFixtures = buildCalendarFixtures(10);
    const { db, log } = openVault();
    const grant = createVaultGrant();

    const emailResult = ingestEmailMessagesToVault({
      messages: emailFixtures,
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });
    expect(emailResult.ingested).toBe(50);
    expect(emailResult.skipped).toBe(0);

    const calendarResult = ingestCalendarEventsToVault({
      events: calendarFixtures,
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });
    expect(calendarResult.ingested).toBe(10);
    expect(calendarResult.skipped).toBe(0);

    const sourceIngestedCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'source_ingested'")
      .get() as { count: number };
    expect(sourceIngestedCount.count).toBe(60);

    const events = log.reader
      .readAll({ grant, principalId: 'principal-connector-ingest', nowMs: NOW_MS })
      .map((entry) => ({
        eventType: entry.event.eventType,
        sourceRefs: entry.event.sourceRefs,
        payloadPlaintext: entry.payloadPlaintext,
      }));

    expect(events).toHaveLength(60);
    expect(events.every((event) => event.eventType === 'source_ingested')).toBe(true);

    for (const message of emailFixtures) {
      const sourceId = buildEmailSourceId(ACCOUNT_ID, message.messageId);
      const matching = events.filter((event) => event.sourceRefs[0]?.sourceId === sourceId);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.sourceRefs[0]?.sourceType).toBe('gmail');
      expect(matching[0]!.payloadPlaintext).not.toMatch(/"access_token"\s*:/);
      expect(matching[0]!.payloadPlaintext).not.toMatch(/"refresh_token"\s*:/);
    }

    for (const event of calendarFixtures) {
      const sourceId = buildCalendarSourceId(ACCOUNT_ID, event.id);
      const matching = events.filter((entry) => entry.sourceRefs[0]?.sourceId === sourceId);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.sourceRefs[0]?.sourceType).toBe('google_calendar');
    }

    const decryptedEvents = readDecryptedEvents({
      reader: log.reader,
      grant,
      principalId: 'principal-connector-ingest',
      nowMs: NOW_MS,
    });

    const emailSources = listVaultConnectedSources(decryptedEvents, 'email');
    expect(emailSources).toHaveLength(50);

    const calendarSources = listVaultConnectedSources(decryptedEvents, 'calendar');
    expect(calendarSources).toHaveLength(10);
  });

  it('gateway connector ingress validates payloads and strips OAuth token fields before vault ingest', () => {
    const { db, log } = openVault();
    const rawMessages = buildEmailFixtures(50).map((message, index) => ({
      ...message,
      access_token: `secret-token-${index}`,
      metadata: {
        refresh_token: `refresh-${index}`,
      },
    }));

    const ingress = ingressConnectorEmailMessages({
      messages: rawMessages,
      accountId: ACCOUNT_ID,
      accountEmail: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });

    expect(ingress.ingested).toBe(50);
    expect(ingress.classification.sourceType).toBe('gmail');
    expect(ingress.classification.domain).toBe('email');

    const sourceIngestedCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'source_ingested'")
      .get() as { count: number };
    expect(sourceIngestedCount.count).toBe(50);

    const calendarIngress = ingressConnectorCalendarEvents({
      events: buildCalendarFixtures(10),
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
    });
    expect(calendarIngress.ingested).toBe(10);

    const totalCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'source_ingested'")
      .get() as { count: number };
    expect(totalCount.count).toBe(60);
  });

  it('connector ingest is idempotent for repeated batches', () => {
    const emailFixtures = buildEmailFixtures(50);
    const calendarFixtures = buildCalendarFixtures(10);
    const { db, log } = openVault();
    const existingEventIds = new Set<string>();

    const firstEmail = ingestEmailMessagesToVault({
      messages: emailFixtures,
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds,
    });
    const firstCalendar = ingestCalendarEventsToVault({
      events: calendarFixtures,
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds,
    });

    expect(firstEmail.ingested).toBe(50);
    expect(firstCalendar.ingested).toBe(10);

    const secondEmail = ingestEmailMessagesToVault({
      messages: emailFixtures,
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds,
    });
    const secondCalendar = ingestCalendarEventsToVault({
      events: calendarFixtures,
      accountId: ACCOUNT_ID,
      eventLog: log,
      deviceId: DEVICE_ID,
      membershipEpoch: 2,
      existingEventIds,
    });

    expect(secondEmail.skipped).toBe(50);
    expect(secondCalendar.skipped).toBe(10);

    const totalCount = db
      .prepare("SELECT COUNT(*) as count FROM vault_event_log WHERE event_type = 'source_ingested'")
      .get() as { count: number };
    expect(totalCount.count).toBe(60);
  });
});

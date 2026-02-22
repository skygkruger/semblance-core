// Contact Frequency Monitor Tests — Decreasing alerts, inactive, filtering, unresolved.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContactStore } from '../../../packages/core/knowledge/contacts/contact-store.js';
import { RelationshipAnalyzer } from '../../../packages/core/knowledge/contacts/relationship-analyzer.js';
import { ContactFrequencyMonitor } from '../../../packages/core/agent/proactive/contact-frequency-monitor.js';

let db: Database.Database;
let store: ContactStore;
let analyzer: RelationshipAnalyzer;
let monitor: ContactFrequencyMonitor;

function setupEmailTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS indexed_emails (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE,
      thread_id TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT 'INBOX',
      "from" TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT '',
      "to" TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      has_attachments INTEGER NOT NULL DEFAULT 0,
      labels TEXT NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'normal',
      account_id TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL
    );
  `);
}

function setupCalendarTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS indexed_calendar_events (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      calendar_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      is_all_day INTEGER NOT NULL DEFAULT 0,
      location TEXT,
      description TEXT,
      attendees TEXT NOT NULL DEFAULT '[]',
      organizer TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      account_id TEXT NOT NULL DEFAULT '',
      indexed_at TEXT NOT NULL
    );
  `);
}

function insertTestEmail(database: Database.Database, from: string, to: string[], subject: string, daysAgo: number): void {
  const receivedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const id = `email_${Math.random().toString(36).slice(2)}`;
  database.prepare(`
    INSERT INTO indexed_emails (id, message_id, thread_id, "from", "to", subject, received_at, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, id, `thread_${id}`, from, JSON.stringify(to), subject, receivedAt, new Date().toISOString());
}

beforeEach(() => {
  db = new Database(':memory:');
  store = new ContactStore(db);
  setupEmailTable(db);
  setupCalendarTable(db);
  analyzer = new RelationshipAnalyzer({ db, contactStore: store });
  monitor = new ContactFrequencyMonitor({ db, contactStore: store, analyzer });
});

describe('ContactFrequencyMonitor', () => {
  it('alerts on decreasing colleague contact', () => {
    const { id } = store.insertContact({
      displayName: 'Fading Colleague',
      emails: ['fading@corp.com'],
      organization: 'Corp Inc',
    });
    store.updateContact(id, { relationshipType: 'colleague' });

    // 5 emails 35-55 days ago, 1 recent
    for (let i = 0; i < 5; i++) {
      insertTestEmail(db, 'fading@corp.com', ['me@home.com'], `Old ${i}`, 35 + i * 4);
    }
    insertTestEmail(db, 'fading@corp.com', ['me@home.com'], 'Recent', 5);

    const alerts = monitor.getDecreasingContacts();
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]!.displayName).toBe('Fading Colleague');
    expect(alerts[0]!.trend).toBe('decreasing');
  });

  it('does not alert on stable contact', () => {
    const { id } = store.insertContact({
      displayName: 'Stable Friend',
      emails: ['stable@test.com'],
    });
    store.updateContact(id, { relationshipType: 'friend' });

    // Equal emails in both periods
    for (let i = 0; i < 3; i++) {
      insertTestEmail(db, 'stable@test.com', ['me@home.com'], `Recent ${i}`, i * 8 + 1);
      insertTestEmail(db, 'stable@test.com', ['me@home.com'], `Previous ${i}`, 35 + i * 8);
    }

    const alerts = monitor.getDecreasingContacts();
    const stableAlert = alerts.find(a => a.displayName === 'Stable Friend');
    expect(stableAlert).toBeUndefined();
  });

  it('alerts on inactive contact with long gap (>90 days)', () => {
    const { id } = store.insertContact({
      displayName: 'Gone Colleague',
      emails: ['gone@corp.com'],
    });
    store.updateContact(id, { relationshipType: 'colleague' });

    // No emails at all in 90 days → inactive
    const alerts = monitor.getDecreasingContacts();
    const goneAlert = alerts.find(a => a.displayName === 'Gone Colleague');
    expect(goneAlert).toBeDefined();
    expect(goneAlert!.trend).toBe('inactive');
  });

  it('does not alert when insufficient data and relationship is unknown', () => {
    store.insertContact({
      displayName: 'Mystery Person',
      emails: ['mystery@test.com'],
    });
    // Default relationship is 'unknown' — should be filtered out

    const alerts = monitor.getDecreasingContacts();
    const mysteryAlert = alerts.find(a => a.displayName === 'Mystery Person');
    expect(mysteryAlert).toBeUndefined();
  });

  it('filters out acquaintance relationships', () => {
    const { id } = store.insertContact({
      displayName: 'Casual Acquaintance',
      emails: ['casual@gmail.com'],
    });
    store.updateContact(id, { relationshipType: 'acquaintance' });

    // Even with decreasing pattern, acquaintance should be filtered
    for (let i = 0; i < 5; i++) {
      insertTestEmail(db, 'casual@gmail.com', ['me@home.com'], `Old ${i}`, 35 + i * 4);
    }

    const alerts = monitor.getDecreasingContacts();
    const casualAlert = alerts.find(a => a.displayName === 'Casual Acquaintance');
    expect(casualAlert).toBeUndefined();
  });

  it('detects unresolved frequent emailer', () => {
    // 12 emails from an address with no matching contact
    for (let i = 0; i < 12; i++) {
      insertTestEmail(db, 'unknown-sender@company.com', ['me@home.com'], `Email ${i}`, i * 5 + 1);
    }

    const unresolved = monitor.getUnresolvedFrequentContacts();
    expect(unresolved.length).toBeGreaterThanOrEqual(1);
    expect(unresolved[0]!.email).toBe('unknown-sender@company.com');
    expect(unresolved[0]!.emailCount).toBeGreaterThanOrEqual(10);
  });
});

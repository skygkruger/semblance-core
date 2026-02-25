/**
 * Step 29 — DataInventoryCollector tests (Commit 1).
 * Tests entity counting across all data stores.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { DataInventoryCollector } from '@semblance/core/privacy/data-inventory-collector';

let db: InstanceType<typeof Database>;
let collector: DataInventoryCollector;

beforeEach(() => {
  db = new Database(':memory:');
  collector = new DataInventoryCollector({ db: db as unknown as DatabaseHandle });
});

afterEach(() => {
  db.close();
});

describe('DataInventoryCollector (Step 29)', () => {
  it('returns zero counts on empty database', () => {
    const inventory = collector.collect();
    expect(inventory.categories).toHaveLength(0);
    expect(inventory.totalEntities).toBe(0);
    expect(inventory.collectedAt).toBeTruthy();
  });

  it('counts emails from indexed_emails table', () => {
    db.exec(`
      CREATE TABLE indexed_emails (
        id TEXT PRIMARY KEY,
        subject TEXT,
        sender TEXT,
        date TEXT
      )
    `);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1', 'Hello', 'a@b.com', '2026-01-01')`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e2', 'World', 'c@d.com', '2026-01-02')`);

    const inventory = collector.collect();
    const emails = inventory.categories.find(c => c.category === 'emails');
    expect(emails).toBeDefined();
    expect(emails!.count).toBe(2);
  });

  it('counts documents grouped by source', () => {
    db.exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT,
        source TEXT,
        content TEXT
      )
    `);
    db.exec(`INSERT INTO documents VALUES ('d1', 'Doc A', 'local', 'text')`);
    db.exec(`INSERT INTO documents VALUES ('d2', 'Doc B', 'local', 'text')`);
    db.exec(`INSERT INTO documents VALUES ('d3', 'Doc C', 'cloud', 'text')`);

    const inventory = collector.collect();
    const docs = inventory.categories.find(c => c.category === 'documents');
    expect(docs).toBeDefined();
    expect(docs!.count).toBe(3);
    expect(docs!.breakdown).toEqual({ local: 2, cloud: 1 });
  });

  it('returns zero for missing tables (finance, health)', () => {
    // Neither transactions nor health_entries tables exist
    const inventory = collector.collect();
    const finance = inventory.categories.find(c => c.category === 'finance');
    const health = inventory.categories.find(c => c.category === 'health');
    expect(finance).toBeUndefined();
    expect(health).toBeUndefined();
  });

  it('counts imports by source_type', () => {
    db.exec(`
      CREATE TABLE imported_items (
        id TEXT PRIMARY KEY,
        source_type TEXT,
        content TEXT
      )
    `);
    db.exec(`INSERT INTO imported_items VALUES ('i1', 'browser_history', 'data')`);
    db.exec(`INSERT INTO imported_items VALUES ('i2', 'browser_history', 'data')`);
    db.exec(`INSERT INTO imported_items VALUES ('i3', 'notes', 'data')`);

    const inventory = collector.collect();
    const imports = inventory.categories.find(c => c.category === 'imports');
    expect(imports).toBeDefined();
    expect(imports!.count).toBe(3);
    expect(imports!.breakdown).toEqual({ browser_history: 2, notes: 1 });
  });

  it('includes contacts with relationship breakdown', () => {
    db.exec(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        name TEXT,
        relationship TEXT
      )
    `);
    db.exec(`INSERT INTO contacts VALUES ('c1', 'Alice', 'friend')`);
    db.exec(`INSERT INTO contacts VALUES ('c2', 'Bob', 'colleague')`);
    db.exec(`INSERT INTO contacts VALUES ('c3', 'Carol', 'friend')`);

    const inventory = collector.collect();
    const contacts = inventory.categories.find(c => c.category === 'contacts');
    expect(contacts).toBeDefined();
    expect(contacts!.count).toBe(3);
    expect(contacts!.breakdown).toEqual({ friend: 2, colleague: 1 });
  });

  it('counts calendar events from indexed_calendar_events table', () => {
    db.exec(`CREATE TABLE indexed_calendar_events (id TEXT PRIMARY KEY, title TEXT)`);
    db.exec(`INSERT INTO indexed_calendar_events VALUES ('ce1', 'Meeting')`);
    db.exec(`INSERT INTO indexed_calendar_events VALUES ('ce2', 'Standup')`);
    db.exec(`INSERT INTO indexed_calendar_events VALUES ('ce3', 'Lunch')`);

    const inventory = collector.collect();
    const cal = inventory.categories.find(c => c.category === 'calendarEvents');
    expect(cal).toBeDefined();
    expect(cal!.count).toBe(3);
  });

  it('counts location history entries', () => {
    db.exec(`CREATE TABLE location_history (id TEXT PRIMARY KEY, lat REAL, lon REAL)`);
    db.exec(`INSERT INTO location_history VALUES ('l1', 40.7, -74.0)`);

    const inventory = collector.collect();
    const locations = inventory.categories.find(c => c.category === 'locations');
    expect(locations).toBeDefined();
    expect(locations!.count).toBe(1);
  });

  it('computes total entity count across all categories', () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e2')`);

    db.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO reminders VALUES ('r1')`);

    db.exec(`CREATE TABLE captures (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO captures VALUES ('c1')`);
    db.exec(`INSERT INTO captures VALUES ('c2')`);
    db.exec(`INSERT INTO captures VALUES ('c3')`);

    const inventory = collector.collect();
    expect(inventory.totalEntities).toBe(6); // 2 + 1 + 3
    expect(inventory.categories).toHaveLength(3);
  });
});

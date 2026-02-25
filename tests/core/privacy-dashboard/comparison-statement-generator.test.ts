/**
 * Step 29 — ComparisonStatementGenerator tests (Commit 4).
 * Tests structured comparison with segments and summary text.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { DataInventoryCollector } from '@semblance/core/privacy/data-inventory-collector';
import { ComparisonStatementGenerator } from '@semblance/core/privacy/comparison-statement-generator';

let db: InstanceType<typeof Database>;
let collector: DataInventoryCollector;
let generator: ComparisonStatementGenerator;

beforeEach(() => {
  db = new Database(':memory:');
  collector = new DataInventoryCollector({ db: db as unknown as DatabaseHandle });
  generator = new ComparisonStatementGenerator({ dataInventoryCollector: collector });
});

afterEach(() => {
  db.close();
});

describe('ComparisonStatementGenerator (Step 29)', () => {
  it('returns empty segments when no data', async () => {
    const result = await generator.generate();
    expect(result.segments).toHaveLength(0);
    expect(result.totalDataPoints).toBe(0);
    expect(result.summaryText).toContain('no indexed data yet');
  });

  it('creates segments for populated categories', async () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e2')`);

    db.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO reminders VALUES ('r1')`);

    const result = await generator.generate();
    expect(result.segments.length).toBeGreaterThanOrEqual(2);

    const emailSegment = result.segments.find(s => s.category === 'emails');
    expect(emailSegment).toBeDefined();
    expect(emailSegment!.count).toBe(2);
    expect(emailSegment!.label).toContain('2');
    expect(emailSegment!.label).toContain('emails');
  });

  it('builds correct summary text with natural English', async () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);

    db.exec(`CREATE TABLE indexed_calendar_events (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_calendar_events VALUES ('c1')`);
    db.exec(`INSERT INTO indexed_calendar_events VALUES ('c2')`);

    const result = await generator.generate();
    expect(result.summaryText).toContain('Your Semblance has indexed');
    expect(result.summaryText).toContain('email');
    expect(result.summaryText).toContain('calendar event');
    expect(result.summaryText).toContain('ChatGPT, it knows nothing');
  });

  it('excludes zero-count categories', async () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    // Empty table — should not appear
    db.exec(`CREATE TABLE reminders (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);

    const result = await generator.generate();
    const reminderSegment = result.segments.find(s => s.category === 'reminders');
    expect(reminderSegment).toBeUndefined();
  });

  it('computes totalDataPoints correctly', async () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e2')`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e3')`);

    db.exec(`CREATE TABLE captures (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO captures VALUES ('c1')`);

    const result = await generator.generate();
    expect(result.totalDataPoints).toBe(4); // 3 + 1
  });

  it('maps import source types to human labels', async () => {
    db.exec(`
      CREATE TABLE imported_items (
        id TEXT PRIMARY KEY,
        source_type TEXT
      )
    `);
    db.exec(`INSERT INTO imported_items VALUES ('i1', 'browser_history')`);
    db.exec(`INSERT INTO imported_items VALUES ('i2', 'browser_history')`);
    db.exec(`INSERT INTO imported_items VALUES ('i3', 'notes')`);

    const result = await generator.generate();
    const browserSegment = result.segments.find(s => s.category === 'import:browser_history');
    expect(browserSegment).toBeDefined();
    expect(browserSegment!.label).toContain('browsing history items');

    const notesSegment = result.segments.find(s => s.category === 'import:notes');
    expect(notesSegment).toBeDefined();
    expect(notesSegment!.label).toContain('notes');
  });
});

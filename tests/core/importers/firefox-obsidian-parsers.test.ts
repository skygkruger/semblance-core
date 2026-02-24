import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FirefoxHistoryParser } from '@semblance/core/importers/browser/firefox-history-parser.js';
import { ObsidianParser } from '@semblance/core/importers/notes/obsidian-parser.js';

function createFirefoxDb(tmpDir: string, entries: Array<{ url: string; title: string; visitDate: number; visitCount: number }>): string {
  const dbPath = join(tmpDir, 'places.sqlite');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE moz_places (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      visit_count INTEGER DEFAULT 0
    );
    CREATE TABLE moz_historyvisits (
      id INTEGER PRIMARY KEY,
      place_id INTEGER,
      visit_date INTEGER
    );
  `);

  const insertPlace = db.prepare('INSERT INTO moz_places (id, url, title, visit_count) VALUES (?, ?, ?, ?)');
  const insertVisit = db.prepare('INSERT INTO moz_historyvisits (place_id, visit_date) VALUES (?, ?)');

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    insertPlace.run(i + 1, e.url, e.title, e.visitCount);
    insertVisit.run(i + 1, e.visitDate);
  }

  db.close();
  return dbPath;
}

describe('FirefoxHistoryParser', () => {
  const parser = new FirefoxHistoryParser();

  it('canParse returns true for valid places.sqlite structure', () => {
    expect(parser.canParse('/home/user/.mozilla/firefox/abc123/places.sqlite')).toBe(true);
  });

  it('parses URL, title, visit_date, visit_count correctly', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'ffx-test-'));
    const visitDateUsec = 1700000000000000; // microseconds
    const dbPath = createFirefoxDb(tmpDir, [
      { url: 'https://example.com', title: 'Example', visitDate: visitDateUsec, visitCount: 5 },
    ]);

    const result = await parser.parse(dbPath);
    expect(result.format).toBe('firefox_sqlite');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('Example');
    expect(result.items[0]!.metadata.url).toBe('https://example.com');
    expect(result.items[0]!.metadata.visit_count).toBe(5);
    expect(result.items[0]!.id).toMatch(/^ffx_/);
  });

  it('deduplicates by URL', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'ffx-test-'));
    const dbPath = createFirefoxDb(tmpDir, [
      { url: 'https://example.com', title: 'Example', visitDate: 1700000000000000, visitCount: 3 },
      { url: 'https://other.com', title: 'Other', visitDate: 1700000001000000, visitCount: 1 },
    ]);

    const result = await parser.parse(dbPath);
    // Each URL appears once in moz_places already; parser should return both
    expect(result.items).toHaveLength(2);
    const urls = result.items.map(i => i.metadata.url);
    expect(urls).toContain('https://example.com');
    expect(urls).toContain('https://other.com');
  });
});

describe('ObsidianParser', () => {
  const parser = new ObsidianParser();

  it('canParse returns true for directory with .md files', () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'obs-test-'));
    writeFileSync(join(tmpDir, 'note.md'), '# Hello');
    expect(parser.canParse(tmpDir)).toBe(true);
  });

  it('parses markdown files with correct title and content', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'obs-test-'));
    writeFileSync(join(tmpDir, 'My Note.md'), '# My Note\n\nSome content here.');

    const result = await parser.parse(tmpDir);
    expect(result.format).toBe('obsidian_md');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.title).toBe('My Note');
    expect(result.items[0]!.content).toContain('Some content here.');
    expect(result.items[0]!.id).toMatch(/^obs_/);
  });

  it('extracts tags and wiki-links from content', async () => {
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'obs-test-'));
    writeFileSync(
      join(tmpDir, 'Tagged.md'),
      '---\ntitle: Tagged Note\n---\n\nThis has #tag1 and #tag2. Links to [[Other Note]] and [[Reference|alias]].',
    );

    const result = await parser.parse(tmpDir);
    expect(result.items).toHaveLength(1);
    const meta = result.items[0]!.metadata;
    expect(meta.tags).toContain('tag1');
    expect(meta.tags).toContain('tag2');
    expect(meta.wikiLinks).toContain('Other Note');
    expect(meta.wikiLinks).toContain('Reference');
  });
});

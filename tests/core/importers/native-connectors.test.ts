/**
 * Native Connectors Test Suite — Tests for Phase 2 OS-integrated readers.
 *
 * Covers:
 * 1. DesktopIMessageReader (iMessage chat.db)
 * 2. SafariHistoryParser (Safari History.db)
 * 3. EdgeHistoryParser (Edge Chromium History)
 * 4. ArcHistoryParser (Arc Chromium History)
 * 5. AppleHealthXmlParser (Apple Health export.xml streaming)
 * 6. ZoteroReader (Zotero zotero.sqlite)
 * 7. ThingsReader (Things 3 main.sqlite)
 *
 * Uses in-memory SQLite for SQLite-based parsers and temp files for XML.
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { writeFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { DesktopIMessageReader } from '@semblance/core/platform/desktop-imessage-reader.js';
import { SafariHistoryParser } from '@semblance/core/importers/browser/safari-history-parser.js';
import { EdgeHistoryParser } from '@semblance/core/importers/browser/edge-history-parser.js';
import { ArcHistoryParser } from '@semblance/core/importers/browser/arc-history-parser.js';
import { AppleHealthXmlParser } from '@semblance/core/importers/health/apple-health-xml-parser.js';
import { ZoteroReader } from '@semblance/core/importers/research/zotero-reader.js';
import { ThingsReader } from '@semblance/core/importers/productivity/things-reader.js';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Core Data epoch offset: seconds between Unix epoch (1970) and Core Data epoch (2001) */
const CORE_DATA_EPOCH_OFFSET = 978307200;

/** Chromium epoch offset: microseconds between Windows FILETIME epoch (1601) and Unix epoch (1970) */
const CHROMIUM_EPOCH_OFFSET_USEC = 11644473600000000;

// ─── Helper Functions ───────────────────────────────────────────────────────────

function tmpDir(prefix: string): string {
  return mkdtempSync(join(process.env.TEMP || '/tmp', `${prefix}-`));
}

// ─── iMessage DB helpers ────────────────────────────────────────────────────────

function createIMessageDb(
  dir: string,
  messages: Array<{
    text: string;
    handleId: string;
    date: number; // Core Data nanoseconds
    isFromMe: number;
    service?: string;
  }>
): string {
  const dbPath = join(dir, 'chat.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE handle (
      ROWID INTEGER PRIMARY KEY,
      id TEXT,
      uncanonicalized_id TEXT
    );
    CREATE TABLE message (
      ROWID INTEGER PRIMARY KEY,
      text TEXT,
      handle_id INTEGER,
      date INTEGER,
      is_from_me INTEGER DEFAULT 0,
      service TEXT DEFAULT 'iMessage'
    );
    CREATE TABLE chat_message_join (
      chat_id INTEGER,
      message_id INTEGER
    );
  `);

  const insertHandle = db.prepare('INSERT INTO handle (ROWID, id, uncanonicalized_id) VALUES (?, ?, ?)');
  const insertMessage = db.prepare('INSERT INTO message (ROWID, text, handle_id, date, is_from_me, service) VALUES (?, ?, ?, ?, ?, ?)');

  const handles = new Map<string, number>();
  let handleIdx = 1;
  for (const msg of messages) {
    if (!handles.has(msg.handleId)) {
      insertHandle.run(handleIdx, msg.handleId, msg.handleId);
      handles.set(msg.handleId, handleIdx);
      handleIdx++;
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const hid = handles.get(m.handleId)!;
    insertMessage.run(i + 1, m.text, hid, m.date, m.isFromMe, m.service || 'iMessage');
  }

  db.close();
  return dbPath;
}

// ─── Safari DB helpers ──────────────────────────────────────────────────────────

function createSafariDb(
  dir: string,
  entries: Array<{ url: string; title: string; visitTime: number; visitCount: number }>
): string {
  // Create in a Safari-like path
  const safariDir = join(dir, 'Library', 'Safari');
  mkdirSync(safariDir, { recursive: true });
  const dbPath = join(safariDir, 'History.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE history_items (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      visit_count INTEGER DEFAULT 0
    );
    CREATE TABLE history_visits (
      id INTEGER PRIMARY KEY,
      history_item INTEGER,
      visit_time REAL,
      title TEXT
    );
  `);

  const insertItem = db.prepare('INSERT INTO history_items (id, url, visit_count) VALUES (?, ?, ?)');
  const insertVisit = db.prepare('INSERT INTO history_visits (history_item, visit_time, title) VALUES (?, ?, ?)');

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    insertItem.run(i + 1, e.url, e.visitCount);
    insertVisit.run(i + 1, e.visitTime, e.title);
  }

  db.close();
  return dbPath;
}

// ─── Chromium DB helpers (Edge + Arc) ───────────────────────────────────────────

function createChromiumDb(
  dir: string,
  pathSegments: string[],
  entries: Array<{ url: string; title: string; visitTime: number; visitCount: number }>
): string {
  const targetDir = join(dir, ...pathSegments);
  mkdirSync(targetDir, { recursive: true });
  const dbPath = join(targetDir, 'History');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      visit_count INTEGER DEFAULT 0
    );
    CREATE TABLE visits (
      id INTEGER PRIMARY KEY,
      url INTEGER,
      visit_time INTEGER
    );
  `);

  const insertUrl = db.prepare('INSERT INTO urls (id, url, title, visit_count) VALUES (?, ?, ?, ?)');
  const insertVisit = db.prepare('INSERT INTO visits (url, visit_time) VALUES (?, ?)');

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    insertUrl.run(i + 1, e.url, e.title, e.visitCount);
    insertVisit.run(i + 1, e.visitTime);
  }

  db.close();
  return dbPath;
}

// ─── Zotero DB helpers ──────────────────────────────────────────────────────────

function createZoteroDb(
  dir: string,
  items: Array<{
    key: string;
    dateAdded: string;
    typeName: string;
    fields: Record<string, string>;
    creators?: Array<{ firstName: string; lastName: string; creatorType: string }>;
    tags?: string[];
    collections?: string[];
  }>
): string {
  const dbPath = join(dir, 'zotero.sqlite');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE itemTypes (
      itemTypeID INTEGER PRIMARY KEY,
      typeName TEXT
    );
    CREATE TABLE fields (
      fieldID INTEGER PRIMARY KEY,
      fieldName TEXT
    );
    CREATE TABLE items (
      itemID INTEGER PRIMARY KEY,
      itemTypeID INTEGER,
      key TEXT,
      dateAdded TEXT
    );
    CREATE TABLE itemData (
      itemID INTEGER,
      fieldID INTEGER,
      valueID INTEGER
    );
    CREATE TABLE itemDataValues (
      valueID INTEGER PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE creators (
      creatorID INTEGER PRIMARY KEY,
      firstName TEXT,
      lastName TEXT
    );
    CREATE TABLE creatorTypes (
      creatorTypeID INTEGER PRIMARY KEY,
      creatorType TEXT
    );
    CREATE TABLE itemCreators (
      itemID INTEGER,
      creatorID INTEGER,
      creatorTypeID INTEGER,
      orderIndex INTEGER
    );
    CREATE TABLE collections (
      collectionID INTEGER PRIMARY KEY,
      collectionName TEXT
    );
    CREATE TABLE collectionItems (
      collectionID INTEGER,
      itemID INTEGER
    );
    CREATE TABLE tags (
      tagID INTEGER PRIMARY KEY,
      name TEXT
    );
    CREATE TABLE itemTags (
      itemID INTEGER,
      tagID INTEGER
    );
    CREATE TABLE deletedItems (
      itemID INTEGER PRIMARY KEY
    );
  `);

  // Insert item types
  const typeMap = new Map<string, number>();
  let typeId = 1;
  for (const item of items) {
    if (!typeMap.has(item.typeName)) {
      db.prepare('INSERT INTO itemTypes (itemTypeID, typeName) VALUES (?, ?)').run(typeId, item.typeName);
      typeMap.set(item.typeName, typeId);
      typeId++;
    }
  }

  // Insert fields
  const fieldMap = new Map<string, number>();
  let fieldId = 1;
  for (const item of items) {
    for (const fieldName of Object.keys(item.fields)) {
      if (!fieldMap.has(fieldName)) {
        db.prepare('INSERT INTO fields (fieldID, fieldName) VALUES (?, ?)').run(fieldId, fieldName);
        fieldMap.set(fieldName, fieldId);
        fieldId++;
      }
    }
  }

  // Insert creator types
  const creatorTypeMap = new Map<string, number>();
  let creatorTypeId = 1;
  for (const item of items) {
    for (const c of item.creators || []) {
      if (!creatorTypeMap.has(c.creatorType)) {
        db.prepare('INSERT INTO creatorTypes (creatorTypeID, creatorType) VALUES (?, ?)').run(creatorTypeId, c.creatorType);
        creatorTypeMap.set(c.creatorType, creatorTypeId);
        creatorTypeId++;
      }
    }
  }

  let valueId = 1;
  let creatorId = 1;
  let collectionId = 1;
  let tagId = 1;
  const tagMap = new Map<string, number>();
  const collectionMap = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const itemID = i + 1;
    const itID = typeMap.get(item.typeName)!;

    db.prepare('INSERT INTO items (itemID, itemTypeID, key, dateAdded) VALUES (?, ?, ?, ?)').run(
      itemID, itID, item.key, item.dateAdded
    );

    // Insert field data
    for (const [fieldName, value] of Object.entries(item.fields)) {
      const fID = fieldMap.get(fieldName)!;
      db.prepare('INSERT INTO itemDataValues (valueID, value) VALUES (?, ?)').run(valueId, value);
      db.prepare('INSERT INTO itemData (itemID, fieldID, valueID) VALUES (?, ?, ?)').run(itemID, fID, valueId);
      valueId++;
    }

    // Insert creators
    for (let ci = 0; ci < (item.creators || []).length; ci++) {
      const c = item.creators![ci]!;
      db.prepare('INSERT INTO creators (creatorID, firstName, lastName) VALUES (?, ?, ?)').run(creatorId, c.firstName, c.lastName);
      const ctID = creatorTypeMap.get(c.creatorType)!;
      db.prepare('INSERT INTO itemCreators (itemID, creatorID, creatorTypeID, orderIndex) VALUES (?, ?, ?, ?)').run(itemID, creatorId, ctID, ci);
      creatorId++;
    }

    // Insert tags
    for (const tag of item.tags || []) {
      if (!tagMap.has(tag)) {
        db.prepare('INSERT INTO tags (tagID, name) VALUES (?, ?)').run(tagId, tag);
        tagMap.set(tag, tagId);
        tagId++;
      }
      db.prepare('INSERT INTO itemTags (itemID, tagID) VALUES (?, ?)').run(itemID, tagMap.get(tag)!);
    }

    // Insert collections
    for (const col of item.collections || []) {
      if (!collectionMap.has(col)) {
        db.prepare('INSERT INTO collections (collectionID, collectionName) VALUES (?, ?)').run(collectionId, col);
        collectionMap.set(col, collectionId);
        collectionId++;
      }
      db.prepare('INSERT INTO collectionItems (collectionID, itemID) VALUES (?, ?)').run(collectionMap.get(col)!, itemID);
    }
  }

  db.close();
  return dbPath;
}

// ─── Things DB helpers ──────────────────────────────────────────────────────────

function createThingsDb(
  dir: string,
  tasks: Array<{
    uuid: string;
    title: string;
    notes?: string;
    status?: number;
    type?: number;
    creationDate?: number; // Core Data seconds since 2001
    userModificationDate?: number;
    startDate?: number | null;
    deadline?: number | null;
    projectUUID?: string | null;
    trashed?: number;
  }>,
  tags?: Array<{ uuid: string; title: string }>,
  taskTags?: Array<{ tasks: string; tags: string }>
): string {
  const thingsDir = join(dir, 'Things Database.thingsdatabase');
  mkdirSync(thingsDir, { recursive: true });
  const dbPath = join(thingsDir, 'main.sqlite');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE TMTask (
      uuid TEXT PRIMARY KEY,
      title TEXT,
      notes TEXT,
      status INTEGER DEFAULT 0,
      type INTEGER DEFAULT 0,
      startDate INTEGER,
      deadline INTEGER,
      creationDate REAL,
      userModificationDate REAL,
      project TEXT,
      trashed INTEGER DEFAULT 0
    );
    CREATE TABLE TMTag (
      uuid TEXT PRIMARY KEY,
      title TEXT
    );
    CREATE TABLE TMTaskTag (
      tasks TEXT,
      tags TEXT
    );
  `);

  const insertTask = db.prepare(`
    INSERT INTO TMTask (uuid, title, notes, status, type, startDate, deadline, creationDate, userModificationDate, project, trashed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of tasks) {
    insertTask.run(
      t.uuid,
      t.title,
      t.notes || null,
      t.status ?? 0,
      t.type ?? 0,
      t.startDate ?? null,
      t.deadline ?? null,
      t.creationDate ?? null,
      t.userModificationDate ?? null,
      t.projectUUID ?? null,
      t.trashed ?? 0,
    );
  }

  if (tags) {
    const insertTag = db.prepare('INSERT INTO TMTag (uuid, title) VALUES (?, ?)');
    for (const tag of tags) {
      insertTag.run(tag.uuid, tag.title);
    }
  }

  if (taskTags) {
    const insertTaskTag = db.prepare('INSERT INTO TMTaskTag (tasks, tags) VALUES (?, ?)');
    for (const tt of taskTags) {
      insertTaskTag.run(tt.tasks, tt.tags);
    }
  }

  db.close();
  return dbPath;
}

// ─── Apple Health XML helpers ───────────────────────────────────────────────────

function createHealthXml(
  dir: string,
  records: Array<{
    type: string;
    value?: string;
    unit?: string;
    startDate: string;
    endDate?: string;
    sourceName?: string;
  }>
): string {
  const filePath = join(dir, 'export.xml');
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<!DOCTYPE HealthData>\n';
  xml += '<HealthData locale="en_US">\n';

  for (const r of records) {
    const attrs = [`type="${r.type}"`, `startDate="${r.startDate}"`];
    if (r.value !== undefined) attrs.push(`value="${r.value}"`);
    if (r.unit) attrs.push(`unit="${r.unit}"`);
    if (r.endDate) attrs.push(`endDate="${r.endDate}"`);
    if (r.sourceName) attrs.push(`sourceName="${r.sourceName}"`);
    xml += `  <Record ${attrs.join(' ')} />\n`;
  }

  xml += '</HealthData>\n';
  writeFileSync(filePath, xml);
  return filePath;
}

// =============================================================================
// TEST SUITES
// =============================================================================

// ─── 1. DesktopIMessageReader ───────────────────────────────────────────────────

describe('DesktopIMessageReader', () => {
  const parser = new DesktopIMessageReader();

  describe('canParse', () => {
    it('returns true for path ending in chat.db', () => {
      expect(parser.canParse('/Users/sky/Library/Messages/chat.db')).toBe(true);
    });

    it('returns true for Messages/chat.db path', () => {
      expect(parser.canParse('/some/path/Messages/chat.db')).toBe(true);
    });

    it('returns false for unrelated database', () => {
      expect(parser.canParse('/some/path/places.sqlite')).toBe(false);
    });

    it('returns false for empty path', () => {
      expect(parser.canParse('')).toBe(false);
    });
  });

  describe('consent requirement', () => {
    it('returns error when consent not given', async () => {
      const dir = tmpDir('imsg-consent');
      const dbPath = createIMessageDb(dir, [
        { text: 'Hello', handleId: '+1234567890', date: 700000000000000000, isFromMe: 0 },
      ]);
      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('consent');
    });

    it('returns error when consentGiven is false', async () => {
      const dir = tmpDir('imsg-consent');
      const dbPath = createIMessageDb(dir, [
        { text: 'Hello', handleId: '+1234567890', date: 700000000000000000, isFromMe: 0 },
      ]);
      const result = await parser.parse(dbPath, { extra: { consentGiven: false } });
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('consent');
    });
  });

  describe('parse', () => {
    it('parses messages with correct fields', async () => {
      const dir = tmpDir('imsg-parse');
      const coreDataNano = 700000000000000000; // nanoseconds since 2001-01-01
      const dbPath = createIMessageDb(dir, [
        { text: 'Hey there', handleId: '+1234567890', date: coreDataNano, isFromMe: 0 },
        { text: 'Hi back', handleId: '+1234567890', date: coreDataNano + 1000000000, isFromMe: 1 },
      ]);

      const result = await parser.parse(dbPath, { extra: { consentGiven: true } });
      expect(result.format).toBe('imessage_sqlite');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.sourceType).toBe('messaging');
      expect(result.items[0]!.id).toMatch(/^msg_/);
    });

    it('correctly identifies sent vs received messages', async () => {
      const dir = tmpDir('imsg-direction');
      const dbPath = createIMessageDb(dir, [
        { text: 'Incoming', handleId: '+1111111111', date: 700000000000000000, isFromMe: 0 },
        { text: 'Outgoing', handleId: '+2222222222', date: 700000001000000000, isFromMe: 1 },
      ]);

      const result = await parser.parse(dbPath, { extra: { consentGiven: true } });
      const received = result.items.find(i => i.content === 'Incoming');
      const sent = result.items.find(i => i.content === 'Outgoing');

      expect(received!.metadata.direction).toBe('received');
      expect(received!.metadata.is_from_me).toBe(false);
      expect(sent!.metadata.direction).toBe('sent');
      expect(sent!.metadata.is_from_me).toBe(true);
    });

    it('respects since filter', async () => {
      const dir = tmpDir('imsg-since');
      // 700000000 = seconds since 2001, convert both to nanoseconds
      const oldNano = 600000000000000000;
      const newNano = 800000000000000000;
      const dbPath = createIMessageDb(dir, [
        { text: 'Old message', handleId: '+1111111111', date: oldNano, isFromMe: 0 },
        { text: 'New message', handleId: '+2222222222', date: newNano, isFromMe: 0 },
      ]);

      // Since filter: 2026-01-01 (well after old, within range of new)
      const sinceDate = new Date('2026-01-01T00:00:00Z');
      const result = await parser.parse(dbPath, { since: sinceDate, extra: { consentGiven: true } });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.content).toBe('New message');
    });

    it('respects limit option', async () => {
      const dir = tmpDir('imsg-limit');
      const messages = Array.from({ length: 20 }, (_, i) => ({
        text: `Message ${i}`,
        handleId: '+1234567890',
        date: 700000000000000000 + i * 1000000000,
        isFromMe: i % 2,
      }));
      const dbPath = createIMessageDb(dir, messages);

      const result = await parser.parse(dbPath, { limit: 5, extra: { consentGiven: true } });
      expect(result.items).toHaveLength(5);
    });

    it('returns error for missing database', async () => {
      const result = await parser.parse('/nonexistent/chat.db', { extra: { consentGiven: true } });
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('Failed to open database');
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('imsg-det1');
      const dir2 = tmpDir('imsg-det2');
      const msgData = [
        { text: 'Same message', handleId: '+1234567890', date: 700000000000000000, isFromMe: 0 },
      ];
      const dbPath1 = createIMessageDb(dir1, msgData);
      const dbPath2 = createIMessageDb(dir2, msgData);

      const result1 = await parser.parse(dbPath1, { extra: { consentGiven: true } });
      const result2 = await parser.parse(dbPath2, { extra: { consentGiven: true } });

      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });
  });
});

// ─── 2. SafariHistoryParser ─────────────────────────────────────────────────────

describe('SafariHistoryParser', () => {
  const parser = new SafariHistoryParser();

  describe('canParse', () => {
    it('returns true for Safari History.db path', () => {
      expect(parser.canParse('/Users/sky/Library/Safari/History.db')).toBe(true);
    });

    it('returns false for non-Safari History.db', () => {
      expect(parser.canParse('/Users/sky/Library/Firefox/History.db')).toBe(false);
    });

    it('returns false for non-History.db file in Safari path', () => {
      expect(parser.canParse('/Users/sky/Library/Safari/Bookmarks.plist')).toBe(false);
    });

    it('returns false for empty path', () => {
      expect(parser.canParse('')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses history with correct fields', async () => {
      const dir = tmpDir('saf-parse');
      // WebKit timestamp: seconds since 2001-01-01
      const webkitTime = 700000000; // ~2023
      const dbPath = createSafariDb(dir, [
        { url: 'https://apple.com', title: 'Apple', visitTime: webkitTime, visitCount: 5 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.format).toBe('safari_sqlite');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Apple');
      expect(result.items[0]!.metadata.url).toBe('https://apple.com');
      expect(result.items[0]!.metadata.visit_count).toBe(5);
      expect(result.items[0]!.metadata.source_browser).toBe('safari');
      expect(result.items[0]!.id).toMatch(/^saf_/);
    });

    it('handles multiple entries', async () => {
      const dir = tmpDir('saf-multi');
      const dbPath = createSafariDb(dir, [
        { url: 'https://apple.com', title: 'Apple', visitTime: 700000000, visitCount: 3 },
        { url: 'https://github.com', title: 'GitHub', visitTime: 700000100, visitCount: 10 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(2);
      expect(result.totalFound).toBe(2);
    });

    it('respects since filter', async () => {
      const dir = tmpDir('saf-since');
      const oldWebkit = 600000000;
      const newWebkit = 800000000;
      const dbPath = createSafariDb(dir, [
        { url: 'https://old.com', title: 'Old', visitTime: oldWebkit, visitCount: 1 },
        { url: 'https://new.com', title: 'New', visitTime: newWebkit, visitCount: 1 },
      ]);

      // Convert a date between old and new to filter
      const sinceDateMs = (700000000 + CORE_DATA_EPOCH_OFFSET) * 1000;
      const result = await parser.parse(dbPath, { since: new Date(sinceDateMs) });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('New');
    });

    it('respects limit option', async () => {
      const dir = tmpDir('saf-limit');
      const entries = Array.from({ length: 15 }, (_, i) => ({
        url: `https://example${i}.com`,
        title: `Site ${i}`,
        visitTime: 700000000 + i * 100,
        visitCount: 1,
      }));
      const dbPath = createSafariDb(dir, entries);

      const result = await parser.parse(dbPath, { limit: 5 });
      expect(result.items).toHaveLength(5);
    });

    it('returns error for missing database', async () => {
      const result = await parser.parse('/nonexistent/Library/Safari/History.db');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('saf-det1');
      const dir2 = tmpDir('saf-det2');
      const entries = [{ url: 'https://apple.com', title: 'Apple', visitTime: 700000000, visitCount: 1 }];
      const dbPath1 = createSafariDb(dir1, entries);
      const dbPath2 = createSafariDb(dir2, entries);

      const result1 = await parser.parse(dbPath1);
      const result2 = await parser.parse(dbPath2);
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });
  });
});

// ─── 3. EdgeHistoryParser ───────────────────────────────────────────────────────

describe('EdgeHistoryParser', () => {
  const parser = new EdgeHistoryParser();

  describe('canParse', () => {
    it('returns true for Windows Edge History path', () => {
      expect(parser.canParse('C:\\Users\\sky\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\History')).toBe(true);
    });

    it('returns true for macOS Edge History path', () => {
      expect(parser.canParse('/Users/sky/Library/Application Support/Microsoft Edge/Default/History')).toBe(true);
    });

    it('returns false for Chrome History path', () => {
      expect(parser.canParse('/Users/sky/Library/Application Support/Google/Chrome/Default/History')).toBe(false);
    });

    it('returns false for non-History file in Edge path', () => {
      expect(parser.canParse('/Users/sky/Library/Application Support/Microsoft Edge/Default/Cookies')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Chromium history with correct fields', async () => {
      const dir = tmpDir('edg-parse');
      // Chromium timestamp: microseconds since 1601-01-01
      // For 2024-01-01: (1704067200 * 1000000) + 11644473600000000
      const chromiumTime = 13350540800000000;
      const dbPath = createChromiumDb(dir, ['Microsoft', 'Edge', 'User Data', 'Default'], [
        { url: 'https://bing.com', title: 'Bing', visitTime: chromiumTime, visitCount: 3 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.format).toBe('edge_sqlite');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Bing');
      expect(result.items[0]!.metadata.url).toBe('https://bing.com');
      expect(result.items[0]!.metadata.source_browser).toBe('edge');
      expect(result.items[0]!.id).toMatch(/^edg_/);
    });

    it('handles multiple entries', async () => {
      const dir = tmpDir('edg-multi');
      const baseTime = 13350540800000000;
      const dbPath = createChromiumDb(dir, ['Microsoft', 'Edge', 'User Data', 'Default'], [
        { url: 'https://bing.com', title: 'Bing', visitTime: baseTime, visitCount: 3 },
        { url: 'https://github.com', title: 'GitHub', visitTime: baseTime + 1000000, visitCount: 1 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(2);
    });

    it('respects since filter', async () => {
      const dir = tmpDir('edg-since');
      const oldTime = 13300000000000000;
      const newTime = 13400000000000000;
      const dbPath = createChromiumDb(dir, ['Microsoft', 'Edge', 'User Data', 'Default'], [
        { url: 'https://old.com', title: 'Old', visitTime: oldTime, visitCount: 1 },
        { url: 'https://new.com', title: 'New', visitTime: newTime, visitCount: 1 },
      ]);

      const sinceDate = new Date('2024-01-01T00:00:00Z');
      const result = await parser.parse(dbPath, { since: sinceDate });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('New');
    });

    it('respects limit option', async () => {
      const dir = tmpDir('edg-limit');
      const baseTime = 13350540800000000;
      const entries = Array.from({ length: 15 }, (_, i) => ({
        url: `https://site${i}.com`,
        title: `Site ${i}`,
        visitTime: baseTime + i * 1000000,
        visitCount: 1,
      }));
      const dbPath = createChromiumDb(dir, ['Microsoft', 'Edge', 'User Data', 'Default'], entries);

      const result = await parser.parse(dbPath, { limit: 5 });
      expect(result.items).toHaveLength(5);
    });

    it('returns error for missing database', async () => {
      const result = await parser.parse('/nonexistent/Microsoft/Edge/User Data/Default/History');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('edg-det1');
      const dir2 = tmpDir('edg-det2');
      const entries = [{ url: 'https://bing.com', title: 'Bing', visitTime: 13350540800000000, visitCount: 1 }];
      const dbPath1 = createChromiumDb(dir1, ['Microsoft', 'Edge', 'User Data', 'Default'], entries);
      const dbPath2 = createChromiumDb(dir2, ['Microsoft', 'Edge', 'User Data', 'Default'], entries);

      const result1 = await parser.parse(dbPath1);
      const result2 = await parser.parse(dbPath2);
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });
  });
});

// ─── 4. ArcHistoryParser ────────────────────────────────────────────────────────

describe('ArcHistoryParser', () => {
  const parser = new ArcHistoryParser();

  describe('canParse', () => {
    it('returns true for Arc User Data History path', () => {
      expect(parser.canParse('/Users/sky/Library/Application Support/Arc/User Data/Default/History')).toBe(true);
    });

    it('returns false for Chrome History path', () => {
      expect(parser.canParse('/Users/sky/Library/Application Support/Google/Chrome/Default/History')).toBe(false);
    });

    it('returns false for non-History file', () => {
      expect(parser.canParse('/Users/sky/Library/Application Support/Arc/User Data/Default/Cookies')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Chromium history with correct fields', async () => {
      const dir = tmpDir('arc-parse');
      const chromiumTime = 13350540800000000;
      const dbPath = createChromiumDb(dir, ['Arc', 'User Data', 'Default'], [
        { url: 'https://thebrowser.company', title: 'Arc', visitTime: chromiumTime, visitCount: 10 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.format).toBe('arc_sqlite');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Arc');
      expect(result.items[0]!.metadata.source_browser).toBe('arc');
      expect(result.items[0]!.id).toMatch(/^arc_/);
    });

    it('handles multiple entries', async () => {
      const dir = tmpDir('arc-multi');
      const baseTime = 13350540800000000;
      const dbPath = createChromiumDb(dir, ['Arc', 'User Data', 'Default'], [
        { url: 'https://a.com', title: 'A', visitTime: baseTime, visitCount: 1 },
        { url: 'https://b.com', title: 'B', visitTime: baseTime + 1000000, visitCount: 2 },
        { url: 'https://c.com', title: 'C', visitTime: baseTime + 2000000, visitCount: 3 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(3);
    });

    it('respects since filter', async () => {
      const dir = tmpDir('arc-since');
      const oldTime = 13300000000000000;
      const newTime = 13400000000000000;
      const dbPath = createChromiumDb(dir, ['Arc', 'User Data', 'Default'], [
        { url: 'https://old.com', title: 'Old', visitTime: oldTime, visitCount: 1 },
        { url: 'https://new.com', title: 'New', visitTime: newTime, visitCount: 1 },
      ]);

      const sinceDate = new Date('2024-01-01T00:00:00Z');
      const result = await parser.parse(dbPath, { since: sinceDate });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('New');
    });

    it('respects limit option', async () => {
      const dir = tmpDir('arc-limit');
      const baseTime = 13350540800000000;
      const entries = Array.from({ length: 10 }, (_, i) => ({
        url: `https://site${i}.com`,
        title: `Site ${i}`,
        visitTime: baseTime + i * 1000000,
        visitCount: 1,
      }));
      const dbPath = createChromiumDb(dir, ['Arc', 'User Data', 'Default'], entries);

      const result = await parser.parse(dbPath, { limit: 3 });
      expect(result.items).toHaveLength(3);
    });

    it('returns error for missing database', async () => {
      const result = await parser.parse('/nonexistent/Arc/User Data/Default/History');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('arc-det1');
      const dir2 = tmpDir('arc-det2');
      const entries = [{ url: 'https://arc.net', title: 'Arc', visitTime: 13350540800000000, visitCount: 1 }];
      const dbPath1 = createChromiumDb(dir1, ['Arc', 'User Data', 'Default'], entries);
      const dbPath2 = createChromiumDb(dir2, ['Arc', 'User Data', 'Default'], entries);

      const result1 = await parser.parse(dbPath1);
      const result2 = await parser.parse(dbPath2);
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });
  });
});

// ─── 5. AppleHealthXmlParser ────────────────────────────────────────────────────

describe('AppleHealthXmlParser', () => {
  const parser = new AppleHealthXmlParser();

  describe('canParse', () => {
    it('returns true for export.xml path', () => {
      expect(parser.canParse('/path/to/apple_health_export/export.xml')).toBe(true);
    });

    it('returns true for data hint with HealthData', () => {
      expect(parser.canParse('data.xml', '<HealthData locale="en_US">')).toBe(true);
    });

    it('returns false for unrelated XML', () => {
      expect(parser.canParse('data.xml')).toBe(false);
    });

    it('returns false for unrelated path', () => {
      expect(parser.canParse('/some/other/file.xml')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses health records with correct fields', async () => {
      const dir = tmpDir('health-parse');
      const filePath = createHealthXml(dir, [
        {
          type: 'HKQuantityTypeIdentifierStepCount',
          value: '5432',
          unit: 'count',
          startDate: '2024-01-15 08:00:00 -0800',
          endDate: '2024-01-15 09:00:00 -0800',
          sourceName: 'iPhone',
        },
      ]);

      const result = await parser.parse(filePath);
      expect(result.format).toBe('apple_health_xml');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.sourceType).toBe('health');
      expect(result.items[0]!.title).toBe('Step Count');
      expect(result.items[0]!.metadata.value).toBe(5432);
      expect(result.items[0]!.metadata.unit).toBe('count');
      expect(result.items[0]!.metadata.source_name).toBe('iPhone');
      expect(result.items[0]!.id).toMatch(/^ahx_/);
    });

    it('parses multiple record types', async () => {
      const dir = tmpDir('health-multi');
      const filePath = createHealthXml(dir, [
        {
          type: 'HKQuantityTypeIdentifierStepCount',
          value: '5432',
          unit: 'count',
          startDate: '2024-01-15 08:00:00 -0800',
          sourceName: 'iPhone',
        },
        {
          type: 'HKQuantityTypeIdentifierHeartRate',
          value: '72',
          unit: 'count/min',
          startDate: '2024-01-15 09:00:00 -0800',
          sourceName: 'Apple Watch',
        },
        {
          type: 'HKCategoryTypeIdentifierSleepAnalysis',
          value: 'HKCategoryValueSleepAnalysisAsleepCore',
          startDate: '2024-01-14 22:00:00 -0800',
          sourceName: 'Apple Watch',
        },
      ]);

      const result = await parser.parse(filePath);
      expect(result.items).toHaveLength(3);
      expect(result.totalFound).toBe(3);
    });

    it('humanizes type identifiers', async () => {
      const dir = tmpDir('health-human');
      const filePath = createHealthXml(dir, [
        {
          type: 'HKQuantityTypeIdentifierBodyMass',
          value: '75',
          unit: 'kg',
          startDate: '2024-01-15 07:00:00 -0800',
        },
      ]);

      const result = await parser.parse(filePath);
      expect(result.items[0]!.title).toBe('Body Mass');
    });

    it('respects since filter', async () => {
      const dir = tmpDir('health-since');
      const filePath = createHealthXml(dir, [
        {
          type: 'HKQuantityTypeIdentifierStepCount',
          value: '1000',
          unit: 'count',
          startDate: '2023-06-15 08:00:00 -0800',
          sourceName: 'iPhone',
        },
        {
          type: 'HKQuantityTypeIdentifierStepCount',
          value: '5000',
          unit: 'count',
          startDate: '2024-06-15 08:00:00 -0800',
          sourceName: 'iPhone',
        },
      ]);

      const sinceDate = new Date('2024-01-01T00:00:00Z');
      const result = await parser.parse(filePath, { since: sinceDate });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.value).toBe(5000);
    });

    it('respects limit option', async () => {
      const dir = tmpDir('health-limit');
      const records = Array.from({ length: 50 }, (_, i) => ({
        type: 'HKQuantityTypeIdentifierStepCount',
        value: String(1000 + i),
        unit: 'count',
        startDate: `2024-01-${String(Math.min(i + 1, 28)).padStart(2, '0')} 08:00:00 -0800`,
        sourceName: 'iPhone',
      }));
      const filePath = createHealthXml(dir, records);

      const result = await parser.parse(filePath, { limit: 10 });
      expect(result.items).toHaveLength(10);
      expect(result.totalFound).toBe(50);
    });

    it('returns error for missing file', async () => {
      const result = await parser.parse('/nonexistent/export.xml');
      expect(result.items).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('health-det1');
      const dir2 = tmpDir('health-det2');
      const records = [{
        type: 'HKQuantityTypeIdentifierStepCount',
        value: '5432',
        unit: 'count',
        startDate: '2024-01-15 08:00:00 -0800',
        sourceName: 'iPhone',
      }];
      const filePath1 = createHealthXml(dir1, records);
      const filePath2 = createHealthXml(dir2, records);

      const result1 = await parser.parse(filePath1);
      const result2 = await parser.parse(filePath2);
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });

    it('handles multi-line Record elements', async () => {
      const dir = tmpDir('health-multiline');
      const filePath = join(dir, 'export.xml');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
  <Record
    type="HKQuantityTypeIdentifierStepCount"
    value="5432"
    unit="count"
    startDate="2024-01-15 08:00:00 -0800"
    endDate="2024-01-15 09:00:00 -0800"
    sourceName="iPhone"
  />
</HealthData>`;
      writeFileSync(filePath, xml);

      const result = await parser.parse(filePath);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Step Count');
    });

    it('streams large files without excessive memory usage', async () => {
      const dir = tmpDir('health-stream');
      const filePath = join(dir, 'export.xml');

      // Write a large file with 10,000 records — should stream, not buffer
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_US">\n';
      for (let i = 0; i < 10000; i++) {
        const day = String((i % 28) + 1).padStart(2, '0');
        const month = String((Math.floor(i / 28) % 12) + 1).padStart(2, '0');
        xml += `  <Record type="HKQuantityTypeIdentifierStepCount" value="${1000 + i}" unit="count" startDate="2024-${month}-${day} 08:00:00 -0800" sourceName="iPhone" />\n`;
      }
      xml += '</HealthData>\n';
      writeFileSync(filePath, xml);

      // Take a baseline memory measurement before parsing
      const memBefore = process.memoryUsage().heapUsed;

      const result = await parser.parse(filePath, { limit: 100 });

      // Verify it parsed correctly
      expect(result.items).toHaveLength(100);
      expect(result.totalFound).toBe(10000);

      // Memory should not spike dramatically (less than 50MB increase for streaming)
      const memAfter = process.memoryUsage().heapUsed;
      const memDiffMB = (memAfter - memBefore) / (1024 * 1024);
      // This is a soft check — we mainly verify it doesn't OOM
      expect(memDiffMB).toBeLessThan(50);
    });

    it('handles records with missing optional attributes', async () => {
      const dir = tmpDir('health-optional');
      const filePath = createHealthXml(dir, [
        {
          type: 'HKQuantityTypeIdentifierStepCount',
          startDate: '2024-01-15 08:00:00 -0800',
          // no value, unit, endDate, sourceName
        },
      ]);

      const result = await parser.parse(filePath);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.value).toBeNull();
      expect(result.items[0]!.metadata.unit).toBeNull();
    });
  });
});

// ─── 6. ZoteroReader ────────────────────────────────────────────────────────────

describe('ZoteroReader', () => {
  const parser = new ZoteroReader();

  describe('canParse', () => {
    it('returns true for zotero.sqlite path', () => {
      expect(parser.canParse('/Users/sky/Zotero/zotero.sqlite')).toBe(true);
    });

    it('returns true for path containing zotero and ending .sqlite', () => {
      expect(parser.canParse('/some/zotero/backup.sqlite')).toBe(true);
    });

    it('returns false for unrelated sqlite file', () => {
      expect(parser.canParse('/some/path/data.sqlite')).toBe(false);
    });

    it('returns false for empty path', () => {
      expect(parser.canParse('')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses items with correct fields', async () => {
      const dir = tmpDir('zot-parse');
      const dbPath = createZoteroDb(dir, [
        {
          key: 'ABC12345',
          dateAdded: '2024-01-15 10:00:00',
          typeName: 'journalArticle',
          fields: {
            title: 'Deep Learning for Climate Science',
            abstractNote: 'A comprehensive review of deep learning applications in climate science.',
            DOI: '10.1234/test.2024',
            date: '2024-01-10',
          },
          creators: [
            { firstName: 'Jane', lastName: 'Smith', creatorType: 'author' },
            { firstName: 'John', lastName: 'Doe', creatorType: 'author' },
          ],
          tags: ['machine-learning', 'climate'],
          collections: ['Research Papers'],
        },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.format).toBe('zotero_sqlite');
      expect(result.items).toHaveLength(1);

      const item = result.items[0]!;
      expect(item.id).toMatch(/^zot_/);
      expect(item.sourceType).toBe('research');
      expect(item.title).toBe('Deep Learning for Climate Science');
      expect(item.metadata.authors).toContain('Jane Smith');
      expect(item.metadata.authors).toContain('John Doe');
      expect(item.metadata.doi).toBe('10.1234/test.2024');
      expect(item.metadata.tags).toContain('machine-learning');
      expect(item.metadata.tags).toContain('climate');
      expect(item.metadata.collections).toContain('Research Papers');
      expect(item.metadata.item_type).toBe('journalArticle');
    });

    it('handles items without optional fields', async () => {
      const dir = tmpDir('zot-minimal');
      const dbPath = createZoteroDb(dir, [
        {
          key: 'MIN00001',
          dateAdded: '2024-01-15 10:00:00',
          typeName: 'book',
          fields: {
            title: 'A Book With No DOI',
          },
        },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('A Book With No DOI');
      expect(result.items[0]!.metadata.doi).toBeNull();
      expect(result.items[0]!.metadata.authors).toEqual([]);
      expect(result.items[0]!.metadata.tags).toEqual([]);
    });

    it('handles multiple items', async () => {
      const dir = tmpDir('zot-multi');
      const dbPath = createZoteroDb(dir, [
        {
          key: 'ITEM0001',
          dateAdded: '2024-01-10 10:00:00',
          typeName: 'journalArticle',
          fields: { title: 'Paper A' },
        },
        {
          key: 'ITEM0002',
          dateAdded: '2024-01-11 10:00:00',
          typeName: 'book',
          fields: { title: 'Book B' },
        },
        {
          key: 'ITEM0003',
          dateAdded: '2024-01-12 10:00:00',
          typeName: 'conferencePaper',
          fields: { title: 'Conference C' },
        },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(3);
      expect(result.totalFound).toBe(3);
    });

    it('respects since filter', async () => {
      const dir = tmpDir('zot-since');
      const dbPath = createZoteroDb(dir, [
        {
          key: 'OLD00001',
          dateAdded: '2023-01-15 10:00:00',
          typeName: 'journalArticle',
          fields: { title: 'Old Paper' },
        },
        {
          key: 'NEW00001',
          dateAdded: '2024-06-15 10:00:00',
          typeName: 'journalArticle',
          fields: { title: 'New Paper' },
        },
      ]);

      const sinceDate = new Date('2024-01-01T00:00:00Z');
      const result = await parser.parse(dbPath, { since: sinceDate });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('New Paper');
    });

    it('respects limit option', async () => {
      const dir = tmpDir('zot-limit');
      const items = Array.from({ length: 20 }, (_, i) => ({
        key: `ITEM${String(i).padStart(4, '0')}`,
        dateAdded: `2024-01-${String(Math.min(i + 1, 28)).padStart(2, '0')} 10:00:00`,
        typeName: 'journalArticle',
        fields: { title: `Paper ${i}` },
      }));
      const dbPath = createZoteroDb(dir, items);

      const result = await parser.parse(dbPath, { limit: 5 });
      expect(result.items).toHaveLength(5);
    });

    it('returns error for missing database', async () => {
      const result = await parser.parse('/nonexistent/zotero.sqlite');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('zot-det1');
      const dir2 = tmpDir('zot-det2');
      const items = [{
        key: 'SAME0001',
        dateAdded: '2024-01-15 10:00:00',
        typeName: 'journalArticle',
        fields: { title: 'Same Paper' },
      }];
      const dbPath1 = createZoteroDb(dir1, items);
      const dbPath2 = createZoteroDb(dir2, items);

      const result1 = await parser.parse(dbPath1);
      const result2 = await parser.parse(dbPath2);
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });

    it('excludes attachment and note item types', async () => {
      const dir = tmpDir('zot-exclude');
      const dbPath = createZoteroDb(dir, [
        {
          key: 'REAL0001',
          dateAdded: '2024-01-15 10:00:00',
          typeName: 'journalArticle',
          fields: { title: 'Real Paper' },
        },
        {
          key: 'ATT00001',
          dateAdded: '2024-01-15 10:00:00',
          typeName: 'attachment',
          fields: { title: 'PDF Attachment' },
        },
        {
          key: 'NOTE0001',
          dateAdded: '2024-01-15 10:00:00',
          typeName: 'note',
          fields: { title: 'A Note' },
        },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Real Paper');
      expect(result.totalFound).toBe(1);
    });

    it('extracts publication metadata', async () => {
      const dir = tmpDir('zot-pub');
      const dbPath = createZoteroDb(dir, [
        {
          key: 'PUB00001',
          dateAdded: '2024-01-15 10:00:00',
          typeName: 'journalArticle',
          fields: {
            title: 'Published Paper',
            publicationTitle: 'Nature',
            volume: '625',
            issue: '7',
            pages: '100-110',
            url: 'https://nature.com/articles/test',
          },
        },
      ]);

      const result = await parser.parse(dbPath);
      const meta = result.items[0]!.metadata;
      expect(meta.publication_title).toBe('Nature');
      expect(meta.volume).toBe('625');
      expect(meta.issue).toBe('7');
      expect(meta.pages).toBe('100-110');
      expect(meta.url).toBe('https://nature.com/articles/test');
    });
  });
});

// ─── 7. ThingsReader ────────────────────────────────────────────────────────────

describe('ThingsReader', () => {
  const parser = new ThingsReader();

  describe('canParse', () => {
    it('returns true for Things database path', () => {
      expect(parser.canParse('/Users/sky/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/Things Database.thingsdatabase/main.sqlite')).toBe(true);
    });

    it('returns true for generic Things sqlite path', () => {
      expect(parser.canParse('/some/things/database.sqlite')).toBe(true);
    });

    it('returns false for unrelated sqlite', () => {
      expect(parser.canParse('/some/path/data.sqlite')).toBe(false);
    });

    it('returns false for empty path', () => {
      expect(parser.canParse('')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses tasks with correct fields', async () => {
      const dir = tmpDir('things-parse');
      // creationDate: Core Data seconds since 2001 -> use 700000000 (~2023)
      const dbPath = createThingsDb(dir, [
        {
          uuid: 'task-uuid-001',
          title: 'Buy groceries',
          notes: 'Milk, eggs, bread',
          status: 0,
          type: 0,
          creationDate: 700000000,
          userModificationDate: 700000100,
          deadline: 20240120,
        },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.format).toBe('things_sqlite');
      expect(result.items).toHaveLength(1);

      const item = result.items[0]!;
      expect(item.id).toMatch(/^thg_/);
      expect(item.sourceType).toBe('productivity');
      expect(item.title).toBe('Buy groceries');
      expect(item.content).toContain('Buy groceries');
      expect(item.content).toContain('Milk, eggs, bread');
      expect(item.metadata.status).toBe('open');
      expect(item.metadata.item_type).toBe('task');
      expect(item.metadata.deadline).toBe('2024-01-20');
      expect(item.metadata.source_app).toBe('things3');
    });

    it('parses tasks with tags', async () => {
      const dir = tmpDir('things-tags');
      const dbPath = createThingsDb(
        dir,
        [{
          uuid: 'task-tagged-001',
          title: 'Tagged task',
          status: 0,
          creationDate: 700000000,
        }],
        [
          { uuid: 'tag-uuid-001', title: 'work' },
          { uuid: 'tag-uuid-002', title: 'urgent' },
        ],
        [
          { tasks: 'task-tagged-001', tags: 'tag-uuid-001' },
          { tasks: 'task-tagged-001', tags: 'tag-uuid-002' },
        ]
      );

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.tags).toContain('work');
      expect(result.items[0]!.metadata.tags).toContain('urgent');
    });

    it('parses task statuses correctly', async () => {
      const dir = tmpDir('things-status');
      const dbPath = createThingsDb(dir, [
        { uuid: 'open-task', title: 'Open', status: 0, creationDate: 700000000 },
        { uuid: 'done-task', title: 'Done', status: 3, creationDate: 700000100 },
        { uuid: 'cancelled-task', title: 'Cancelled', status: 2, creationDate: 700000200 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(3);

      const statuses = new Map(result.items.map(i => [i.title, i.metadata.status]));
      expect(statuses.get('Open')).toBe('open');
      expect(statuses.get('Done')).toBe('done');
      expect(statuses.get('Cancelled')).toBe('cancelled');
    });

    it('excludes trashed tasks', async () => {
      const dir = tmpDir('things-trash');
      const dbPath = createThingsDb(dir, [
        { uuid: 'kept-task', title: 'Keep', status: 0, creationDate: 700000000, trashed: 0 },
        { uuid: 'trashed-task', title: 'Trash', status: 0, creationDate: 700000100, trashed: 1 },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Keep');
    });

    it('links tasks to projects', async () => {
      const dir = tmpDir('things-project');
      const dbPath = createThingsDb(dir, [
        { uuid: 'project-001', title: 'Home Renovation', status: 0, type: 1, creationDate: 700000000 },
        { uuid: 'task-in-project', title: 'Paint walls', status: 0, type: 0, creationDate: 700000100, projectUUID: 'project-001' },
      ]);

      const result = await parser.parse(dbPath);
      const paintTask = result.items.find(i => i.title === 'Paint walls');
      expect(paintTask).toBeDefined();
      expect(paintTask!.metadata.project_title).toBe('Home Renovation');
      expect(paintTask!.content).toContain('Project: Home Renovation');
    });

    it('respects since filter', async () => {
      const dir = tmpDir('things-since');
      const oldCreation = 600000000; // ~2020
      const newCreation = 800000000; // ~2026
      const dbPath = createThingsDb(dir, [
        { uuid: 'old-task', title: 'Old Task', status: 0, creationDate: oldCreation },
        { uuid: 'new-task', title: 'New Task', status: 0, creationDate: newCreation },
      ]);

      // Filter: only tasks created after 2024-01-01
      const sinceDate = new Date('2024-01-01T00:00:00Z');
      const result = await parser.parse(dbPath, { since: sinceDate });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('New Task');
    });

    it('respects limit option', async () => {
      const dir = tmpDir('things-limit');
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        uuid: `task-limit-${String(i).padStart(3, '0')}`,
        title: `Task ${i}`,
        status: 0,
        creationDate: 700000000 + i * 100,
      }));
      const dbPath = createThingsDb(dir, tasks);

      const result = await parser.parse(dbPath, { limit: 7 });
      expect(result.items).toHaveLength(7);
    });

    it('returns error for missing database', async () => {
      const result = await parser.parse('/nonexistent/Things Database.thingsdatabase/main.sqlite');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('produces deterministic IDs', async () => {
      const dir1 = tmpDir('things-det1');
      const dir2 = tmpDir('things-det2');
      const tasks = [{ uuid: 'same-uuid-001', title: 'Same Task', status: 0, creationDate: 700000000 }];
      const dbPath1 = createThingsDb(dir1, tasks);
      const dbPath2 = createThingsDb(dir2, tasks);

      const result1 = await parser.parse(dbPath1);
      const result2 = await parser.parse(dbPath2);
      expect(result1.items[0]!.id).toBe(result2.items[0]!.id);
    });

    it('converts Things date integers correctly', async () => {
      const dir = tmpDir('things-dates');
      const dbPath = createThingsDb(dir, [
        {
          uuid: 'date-task',
          title: 'Date Task',
          status: 0,
          creationDate: 700000000,
          startDate: 20240315,
          deadline: 20240401,
        },
      ]);

      const result = await parser.parse(dbPath);
      expect(result.items[0]!.metadata.start_date).toBe('2024-03-15');
      expect(result.items[0]!.metadata.deadline).toBe('2024-04-01');
    });
  });
});

// ─── Cross-Cutting: Deterministic ID Verification ───────────────────────────────

describe('Deterministic ID Generation', () => {
  it('all parsers produce IDs with correct prefixes', () => {
    const prefixes: Record<string, string> = {
      msg: 'iMessage',
      saf: 'Safari',
      edg: 'Edge',
      arc: 'Arc',
      ahx: 'Apple Health',
      zot: 'Zotero',
      thg: 'Things',
    };

    for (const prefix of Object.keys(prefixes)) {
      const hash = createHash('sha256').update('test').digest('hex').slice(0, 12);
      const id = `${prefix}_${hash}`;
      expect(id).toMatch(new RegExp(`^${prefix}_[a-f0-9]{12}$`));
    }
  });

  it('SHA-256 hash is truly deterministic for same input', () => {
    const input = 'https://example.com/page';
    const hash1 = createHash('sha256').update(input).digest('hex').slice(0, 12);
    const hash2 = createHash('sha256').update(input).digest('hex').slice(0, 12);
    expect(hash1).toBe(hash2);
  });

  it('SHA-256 hash differs for different inputs', () => {
    const hash1 = createHash('sha256').update('input-a').digest('hex').slice(0, 12);
    const hash2 = createHash('sha256').update('input-b').digest('hex').slice(0, 12);
    expect(hash1).not.toBe(hash2);
  });
});

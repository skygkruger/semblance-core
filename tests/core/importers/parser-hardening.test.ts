// Parser Hardening Tests — Verify safe-read, csv-sanitizer, XXE rejection, symlink detection.
// Chunk 8 of the security audit remediation.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  sanitizeCsvCell,
  sanitizeCsvRows,
} from '../../../packages/core/importers/csv-sanitizer.js';
import {
  FileTooLargeError,
  SymlinkDetectedError,
  XmlEntityError,
  rejectXmlEntities,
} from '../../../packages/core/importers/safe-read.js';

// ─── CSV Sanitizer Tests ──────────────────────────────────────────────────────

describe('sanitizeCsvCell', () => {
  it('strips leading = prefix', () => {
    expect(sanitizeCsvCell('=CMD("calc")')).toBe('CMD("calc")');
  });

  it('strips leading + prefix', () => {
    expect(sanitizeCsvCell('+1234')).toBe('1234');
  });

  it('strips leading - prefix', () => {
    expect(sanitizeCsvCell('-cmd')).toBe('cmd');
  });

  it('strips leading @ prefix', () => {
    expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe('SUM(A1:A10)');
  });

  it('strips leading tab character', () => {
    expect(sanitizeCsvCell('\tdata')).toBe('data');
  });

  it('strips leading carriage return', () => {
    expect(sanitizeCsvCell('\rdata')).toBe('data');
  });

  it('strips chained formula prefixes', () => {
    expect(sanitizeCsvCell('=-+@payload')).toBe('payload');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeCsvCell('')).toBe('');
  });

  it('returns null/undefined unchanged', () => {
    expect(sanitizeCsvCell(null as unknown as string)).toBeNull();
    expect(sanitizeCsvCell(undefined as unknown as string)).toBeUndefined();
  });

  it('does not modify normal text', () => {
    expect(sanitizeCsvCell('Hello World')).toBe('Hello World');
    expect(sanitizeCsvCell('normal value')).toBe('normal value');
    expect(sanitizeCsvCell('123.45')).toBe('123.45');
  });
});

describe('sanitizeCsvRows', () => {
  it('sanitizes string values in row objects', () => {
    const rows = [
      { name: '=EVIL', amount: 42, note: '+danger' },
      { name: 'Safe', amount: 99, note: 'OK' },
    ];
    const result = sanitizeCsvRows(rows);
    expect(result[0]!.name).toBe('EVIL');
    expect(result[0]!.amount).toBe(42);
    expect(result[0]!.note).toBe('danger');
    expect(result[1]!.name).toBe('Safe');
  });
});

// ─── XXE Rejection Tests ──────────────────────────────────────────────────────

describe('rejectXmlEntities', () => {
  it('rejects DOCTYPE with ENTITY definitions', () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>';
    expect(() => rejectXmlEntities(xml, '/test/file.xml')).toThrow(XmlEntityError);
  });

  it('allows normal XML without DOCTYPE ENTITY', () => {
    const xml = '<?xml version="1.0"?><root><item>Hello</item></root>';
    expect(() => rejectXmlEntities(xml, '/test/file.xml')).not.toThrow();
  });

  it('allows DOCTYPE without ENTITY', () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE html><root></root>';
    expect(() => rejectXmlEntities(xml, '/test/file.xml')).not.toThrow();
  });

  it('is case-insensitive', () => {
    const xml = '<?xml version="1.0"?><!doctype foo [<!entity xxe SYSTEM "file:///etc/passwd">]><root/>';
    expect(() => rejectXmlEntities(xml, '/test/file.xml')).toThrow(XmlEntityError);
  });
});

// ─── Error Classes ────────────────────────────────────────────────────────────

describe('Error classes', () => {
  it('FileTooLargeError has correct name and message', () => {
    const err = new FileTooLargeError('/path/file.json', 200_000_000, 100_000_000);
    expect(err.name).toBe('FileTooLargeError');
    expect(err.message).toContain('190.7MB');
    expect(err.message).toContain('95.4MB');
  });

  it('SymlinkDetectedError has correct name', () => {
    const err = new SymlinkDetectedError('/path/link');
    expect(err.name).toBe('SymlinkDetectedError');
    expect(err.message).toContain('Symlink detected');
  });

  it('XmlEntityError has correct name', () => {
    const err = new XmlEntityError('/path/file.xml');
    expect(err.name).toBe('XmlEntityError');
    expect(err.message).toContain('XXE');
  });
});

// ─── Source Verification: All parsers use safe-read ───────────────────────────

describe('Parser source verification — no raw readFileSync', () => {
  const IMPORTERS_DIR = resolve(__dirname, '../../../packages/core/importers');

  const parserFiles = [
    'notes/obsidian-parser.ts',
    'notes/notion-export-parser.ts',
    'notes/bear-export-parser.ts',
    'notes/evernote-export-parser.ts',
    'notes/apple-notes-parser.ts',
    'social/twitter-archive-parser.ts',
    'social/linkedin-export-parser.ts',
    'social/discord-export-parser.ts',
    'social/facebook-export-parser.ts',
    'social/instagram-export-parser.ts',
    'messaging/whatsapp-parser.ts',
    'messaging/signal-export-parser.ts',
    'messaging/telegram-export-parser.ts',
    'photos/exif-parser.ts',
    'media/goodreads-export-parser.ts',
    'fitness/strava-export-parser.ts',
    'productivity/slack-export-parser.ts',
    'google/google-takeout-parser.ts',
    'finance/mint-export-parser.ts',
    'finance/ynab-export-parser.ts',
    'browser/chrome-history-parser.ts',
    'health/apple-health-xml-parser.ts',
  ];

  for (const file of parserFiles) {
    it(`${file} does not use raw readFileSync`, () => {
      const source = readFileSync(resolve(IMPORTERS_DIR, file), 'utf-8');
      // Must not import readFileSync directly from node:fs
      const directImport = /from\s+['"]node:fs['"]/.test(source) &&
        /\breadFileSync\b/.test(source) &&
        !source.includes('safeReadFileSync') &&
        !source.includes('safeReadFileSyncBuffer');
      expect(directImport).toBe(false);
    });
  }

  const csvParsers = [
    'finance/mint-export-parser.ts',
    'finance/ynab-export-parser.ts',
    'fitness/strava-export-parser.ts',
    'media/goodreads-export-parser.ts',
    'social/linkedin-export-parser.ts',
  ];

  for (const file of csvParsers) {
    it(`${file} uses CSV sanitization`, () => {
      const source = readFileSync(resolve(IMPORTERS_DIR, file), 'utf-8');
      expect(source).toContain('sanitizeCsvCell');
    });
  }

  const xmlParsers = [
    'health/apple-health-xml-parser.ts',
    'notes/evernote-export-parser.ts',
  ];

  for (const file of xmlParsers) {
    it(`${file} rejects XML entities`, () => {
      const source = readFileSync(resolve(IMPORTERS_DIR, file), 'utf-8');
      expect(source).toContain('rejectXmlEntities');
    });
  }

  const directoryWalkers = [
    'notes/obsidian-parser.ts',
    'notes/notion-export-parser.ts',
    'notes/bear-export-parser.ts',
    'photos/exif-parser.ts',
  ];

  for (const file of directoryWalkers) {
    it(`${file} uses safeWalkDirectory for symlink protection`, () => {
      const source = readFileSync(resolve(IMPORTERS_DIR, file), 'utf-8');
      expect(source).toContain('safeWalkDirectory');
    });
  }
});

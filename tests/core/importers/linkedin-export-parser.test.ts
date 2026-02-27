/**
 * LinkedIn Export Parser Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInExportParser, parseCSV } from '../../../packages/core/importers/social/linkedin-export-parser.js';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  lstatSync: vi.fn(() => ({ isSymbolicLink: () => false })),
  statSync: vi.fn(() => ({ size: 1024 })),
}));

describe('LinkedInExportParser', () => {
  const parser = new LinkedInExportParser();

  describe('parseCSV utility', () => {
    it('parses simple CSV rows', () => {
      const csv = 'Name,Age,City\nAlice,30,NYC\nBob,25,LA';
      const rows = parseCSV(csv);
      expect(rows).toEqual([
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'NYC'],
        ['Bob', '25', 'LA'],
      ]);
    });

    it('handles quoted fields with commas', () => {
      const csv = 'Name,Title\n"Smith, John","VP, Engineering"';
      const rows = parseCSV(csv);
      expect(rows[1]).toEqual(['Smith, John', 'VP, Engineering']);
    });

    it('handles escaped quotes (double-quote)', () => {
      const csv = 'Name,Desc\nAlice,"She said ""hello"""';
      const rows = parseCSV(csv);
      expect(rows[1]![1]).toBe('She said "hello"');
    });

    it('handles CRLF line endings', () => {
      const csv = 'A,B\r\n1,2\r\n3,4';
      const rows = parseCSV(csv);
      expect(rows.length).toBe(3);
      expect(rows[1]).toEqual(['1', '2']);
    });
  });

  describe('canParse', () => {
    it('accepts Connections.csv path', () => {
      expect(parser.canParse('/data/linkedin/Connections.csv')).toBe(true);
    });

    it('accepts messages.csv path', () => {
      expect(parser.canParse('/data/linkedin/messages.csv')).toBe(true);
    });

    it('accepts file with LinkedIn headers', () => {
      const data = 'First Name,Last Name,Email Address,Company,Position,Connected On\n';
      expect(parser.canParse('/data/export.csv', data)).toBe(true);
    });

    it('rejects non-csv files', () => {
      expect(parser.canParse('/data/file.json')).toBe(false);
    });
  });

  describe('parse connections', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const connectionsCSV = `First Name,Last Name,Email Address,Company,Position,Connected On
Alice,Smith,alice@example.com,Acme Corp,Engineer,15 Jan 2024
Bob,Jones,,Big Inc,Manager,10 Feb 2023`;

    it('parses connections with correct fields', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(connectionsCSV);

      const result = await parser.parse('/data/Connections.csv');
      expect(result.items.length).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.format).toBe('linkedin_csv');

      // Sorted descending by date — Alice first
      const alice = result.items[0]!;
      expect(alice.sourceType).toBe('social');
      expect(alice.title).toBe('Alice Smith');
      expect(alice.metadata.platform).toBe('linkedin');
      expect(alice.metadata.type).toBe('connection');
      expect(alice.metadata.email).toBe('alice@example.com');
      expect(alice.metadata.company).toBe('Acme Corp');

      const bob = result.items[1]!;
      expect(bob.title).toBe('Bob Jones');
      expect(bob.metadata.email).toBeNull();
    });

    it('generates deterministic IDs', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(connectionsCSV);

      const r1 = await parser.parse('/data/Connections.csv');
      const r2 = await parser.parse('/data/Connections.csv');
      expect(r1.items[0]!.id).toBe(r2.items[0]!.id);
      expect(r1.items[0]!.id).toMatch(/^li_cn_/);
    });

    it('respects since filter', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(connectionsCSV);

      const result = await parser.parse('/data/Connections.csv', {
        since: new Date('2024-01-01'),
      });
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.title).toBe('Alice Smith');
    });

    it('respects limit option', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(connectionsCSV);

      const result = await parser.parse('/data/Connections.csv', { limit: 1 });
      expect(result.items.length).toBe(1);
    });
  });

  describe('parse messages', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const messagesCSV = `CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,DATE,SUBJECT,CONTENT
conv-1,Chat with Alice,Alice Smith,https://linkedin.com/in/alice,2024-01-15,Hello,Hey how are you doing?
conv-1,Chat with Alice,Bob Jones,https://linkedin.com/in/bob,2024-01-16,,I'm great thanks!`;

    it('parses messages correctly', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(messagesCSV);

      const result = await parser.parse('/data/messages.csv');
      expect(result.items.length).toBe(2);
      expect(result.items[0]!.metadata.type).toBe('message');
      expect(result.items[0]!.metadata.platform).toBe('linkedin');
      expect(result.items[0]!.metadata.conversation_id).toBe('conv-1');
    });
  });

  describe('parse positions', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const positionsCSV = `Company Name,Title,Started On,Finished On,Location,Description
Acme Corp,Senior Engineer,Jan 2022,,San Francisco,Building great software
Old Co,Junior Dev,Jun 2019,Dec 2021,Remote,Learning the ropes`;

    it('parses positions correctly', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(positionsCSV);

      const result = await parser.parse('/data/Positions.csv');
      expect(result.items.length).toBe(2);
      expect(result.items[0]!.metadata.type).toBe('position');
      expect(result.items[0]!.title).toContain('Senior Engineer');
      expect(result.items[0]!.title).toContain('Acme Corp');
      expect(result.items[0]!.metadata.is_current).toBe(true);
      expect(result.items[1]!.metadata.is_current).toBe(false);
    });
  });

  describe('parse skills', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    const skillsCSV = `Name\nTypeScript\nRust\nReact\nGraphQL`;

    it('bundles skills into single item', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(skillsCSV);

      const result = await parser.parse('/data/Skills.csv');
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.metadata.type).toBe('skills');
      expect(result.items[0]!.metadata.count).toBe(4);
      expect(result.items[0]!.content).toContain('TypeScript');
      expect(result.items[0]!.content).toContain('Rust');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('handles file read errors', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('ENOENT: no such file');
      });

      const result = await parser.parse('/nonexistent/Connections.csv');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('handles empty CSV', async () => {
      const fs = await import('node:fs');
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('Name\n');

      const result = await parser.parse('/data/Connections.csv');
      expect(result.items).toHaveLength(0);
    });

    it('handles BOM-prefixed CSV', async () => {
      const fs = await import('node:fs');
      const bom = '\uFEFF';
      const csv = `${bom}First Name,Last Name,Email Address,Company,Position,Connected On\nAlice,Smith,a@b.com,Co,Eng,15 Jan 2024`;
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(csv);

      const result = await parser.parse('/data/Connections.csv');
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.title).toBe('Alice Smith');
    });
  });
});

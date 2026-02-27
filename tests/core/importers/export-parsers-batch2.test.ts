/**
 * Export Parsers Batch 2 Tests
 *
 * Tests for: EvernoteExportParser, YnabExportParser, MintExportParser,
 * GoogleTakeoutParser, GoodreadsExportParser, StravaExportParser, TelegramExportParser
 *
 * ~75 tests (10+ per parser)
 *
 * Mocking strategy:
 * - Parsers use both `require('node:fs')` in canParse (sync) and `await import('node:fs')` in parse (async).
 * - vi.mock('node:fs') intercepts both require and dynamic import in vitest.
 * - Module-level mock variables are declared BEFORE vi.mock factory and referenced directly in tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EvernoteExportParser } from '../../../packages/core/importers/notes/evernote-export-parser.js';
import { YnabExportParser } from '../../../packages/core/importers/finance/ynab-export-parser.js';
import { MintExportParser } from '../../../packages/core/importers/finance/mint-export-parser.js';
import { GoogleTakeoutParser } from '../../../packages/core/importers/google/google-takeout-parser.js';
import { GoodreadsExportParser } from '../../../packages/core/importers/media/goodreads-export-parser.js';
import { StravaExportParser } from '../../../packages/core/importers/fitness/strava-export-parser.js';
import { TelegramExportParser } from '../../../packages/core/importers/messaging/telegram-export-parser.js';

// ─── Mocks must be hoisted ─────────────────────────────────────────────────

const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockStatSync = vi.fn();
const mockExistsSync = vi.fn();

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  existsSync: mockExistsSync,
}));

vi.mock('node:path', () => ({
  join: (...args: string[]) => args.join('/'),
  basename: (p: string, ext?: string) => {
    const base = p.replace(/\\/g, '/').split('/').pop() ?? p;
    if (ext && base.endsWith(ext)) return base.slice(0, -ext.length);
    return base;
  },
  extname: (p: string) => {
    const match = p.match(/\.[^./]+$/);
    return match ? match[0] : '';
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function resetAllMocks() {
  mockReadFileSync.mockReset();
  mockReaddirSync.mockReset();
  mockStatSync.mockReset();
  mockExistsSync.mockReset();
}

// ============================================================================
// Test Fixtures
// ============================================================================

const EVERNOTE_ENEX_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20231015T120000Z" application="Evernote">
  <note>
    <title>Meeting Notes</title>
    <content><![CDATA[<en-note><p>Discussed project timeline</p><p>Action items:</p><ul><li>Review spec</li><li>Update roadmap</li></ul></en-note>]]></content>
    <created>20231015T120000Z</created>
    <updated>20231016T090000Z</updated>
    <tag>work</tag>
    <tag>meetings</tag>
  </note>
  <note>
    <title>Recipe: Pasta</title>
    <content><![CDATA[<en-note><p>Ingredients: pasta, tomatoes, garlic</p><p>Cook for 20 minutes</p></en-note>]]></content>
    <created>20231001T080000Z</created>
    <updated>20231001T080000Z</updated>
    <tag>cooking</tag>
  </note>
  <note>
    <title>Quick thought</title>
    <content><![CDATA[<en-note>Simple plain text note &amp; special chars &lt;here&gt;</en-note>]]></content>
    <created>20231020T140000Z</created>
    <updated>20231020T140000Z</updated>
  </note>
</en-export>`;

const EVERNOTE_ENEX_MALFORMED = `<?xml version="1.0" encoding="UTF-8"?>
<en-export>
  <note>
    <title>Valid Note</title>
    <content><![CDATA[<en-note>Content here</en-note>]]></content>
    <created>20231015T120000Z</created>
  </note>
  <note>
  </note>
  <note>
    <title>Another Valid Note</title>
    <content><![CDATA[<en-note>More content</en-note>]]></content>
    <created>20231010T080000Z</created>
  </note>
</en-export>`;

const YNAB_REGISTER_CSV = `"Account","Flag","Date","Payee","Category Group/Category","Category Group","Category","Memo","Outflow","Inflow","Cleared"
"Checking","","01/15/2024","Grocery Store","Food/Groceries","Food","Groceries","Weekly groceries","$85.50","$0.00","Cleared"
"Checking","","01/16/2024","Payroll","Income/Salary","Income","Salary","January paycheck","$0.00","$3,500.00","Cleared"
"Credit Card","Red","01/17/2024","Gas Station","Transport/Fuel","Transport","Fuel","Fill up","$45.00","$0.00","Uncleared"
"Checking","","01/10/2024","Electric Company","Bills/Utilities","Bills","Utilities","Monthly electric","$120.00","$0.00","Cleared"`;

const YNAB_BUDGET_CSV = `"Month","Category Group","Category","Budgeted","Activity","Available"
"Jan 2024","Food","Groceries","$400.00","$285.50","$114.50"
"Jan 2024","Transport","Fuel","$150.00","$45.00","$105.00"
"Jan 2024","Bills","Utilities","$200.00","$120.00","$80.00"`;

const MINT_TRANSACTIONS_CSV = `"Date","Description","Original Description","Amount","Transaction Type","Category","Account Name","Labels","Notes"
"1/15/2024","Whole Foods","WHOLEFDS MKT #1234","85.50","debit","Groceries","Chase Checking","","Weekly shopping"
"1/16/2024","Direct Deposit","PAYROLL ACME INC","3500.00","credit","Income","Chase Checking","",""
"1/17/2024","Shell Gas","SHELL OIL 12345","45.00","debit","Gas & Fuel","Chase Credit","",""
"1/10/2024","Electric Bill","CITY ELECTRIC CO","120.00","debit","Utilities","Chase Checking","bills","Monthly"`;

const GOOGLE_YOUTUBE_HISTORY = JSON.stringify([
  {
    title: 'Watched TypeScript Tutorial for Beginners',
    titleUrl: 'https://www.youtube.com/watch?v=abc123',
    time: '2024-01-15T10:30:00.000Z',
    subtitles: [{ name: 'Fireship', url: 'https://www.youtube.com/channel/xyz' }],
    header: 'YouTube',
  },
  {
    title: 'Watched Rust vs Go in 2024',
    titleUrl: 'https://www.youtube.com/watch?v=def456',
    time: '2024-01-14T18:00:00.000Z',
    subtitles: [{ name: 'ThePrimeagen' }],
    header: 'YouTube',
  },
  {
    title: 'Watched Cat Videos Compilation',
    titleUrl: 'https://www.youtube.com/watch?v=ghi789',
    time: '2024-01-01T09:00:00.000Z',
    subtitles: [],
    header: 'YouTube',
  },
]);

const GOOGLE_SEARCH_ACTIVITY = JSON.stringify([
  {
    title: 'Searched for best typescript frameworks 2024',
    titleUrl: 'https://www.google.com/search?q=best+typescript+frameworks+2024',
    time: '2024-01-15T08:00:00.000Z',
    products: ['Search'],
  },
  {
    title: 'Searched for tauri vs electron',
    titleUrl: 'https://www.google.com/search?q=tauri+vs+electron',
    time: '2024-01-14T15:30:00.000Z',
    products: ['Search'],
  },
]);

const GOODREADS_CSV = `Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies
1234,"The Pragmatic Programmer","David Thomas","Thomas, David","Andrew Hunt",="0135957052",="9780135957059",5,4.33,Addison-Wesley,Paperback,352,2019,1999,2024/01/10,2023/12/01,"programming, favorites","programming (#1), favorites (#1)",read,"Essential reading for any developer",,,2,1
5678,"Dune","Frank Herbert","Herbert, Frank","",="0441013597",="9780441013593",4,4.25,Ace Books,Paperback,688,2005,1965,2024/01/05,2023/11/15,"sci-fi, classics","sci-fi (#1), classics (#1)",read,,,,1,1
9012,"Project Hail Mary","Andy Weir","Weir, Andy","",="0593135202",="9780593135204",0,4.52,Ballantine Books,Hardcover,496,2021,2021,,2024/01/12,"sci-fi, to-read","sci-fi (#2), to-read (#1)",to-read,,,,0,0`;

const STRAVA_ACTIVITIES_CSV = `Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time (seconds),Moving Time,Moving Time (seconds),Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Elevation Low,Elevation High,Max Grade,Average Grade,Max Cadence,Average Cadence,Max Heart Rate,Average Heart Rate,Max Watts,Average Watts,Calories
10001,"Jan 15, 2024, 7:30:00 AM","Morning Run","Run","Easy morning jog","00:45:30","5.2",175,42,false,Nike Pegasus,,75.0,,2730,,2580,5.2,12.5,7.25,45,43,100,145,,,90,85,175,155,,,450
10002,"Jan 14, 2024, 6:00:00 PM","Evening Ride","Ride","Post-work ride","01:30:00","35.5",168,85,true,Trek Domane,,75.0,8.5,5400,,5100,35.5,45.0,25.0,320,315,50,370,,,100,90,168,142,280,195,850
10003,"Jan 10, 2024, 12:00:00 PM","Lunchtime Swim","Swim","Pool session","00:35:00","1.5",160,30,false,,,75.0,,2100,,1950,1.5,,,0,0,,,,,,,160,140,,,350`;

const TELEGRAM_EXPORT_BASIC = JSON.stringify({
  personal_information: { first_name: 'John', last_name: 'Doe' },
  chats: {
    about: 'Telegram data export',
    list: [
      {
        name: 'Alice',
        type: 'personal_chat',
        id: 12345,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-15T10:30:00',
            from: 'John',
            from_id: 'user100',
            text: 'Hey Alice, how are you?',
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-15T10:31:00',
            from: 'Alice',
            from_id: 'user200',
            text: 'Hi John! I am great.',
          },
          {
            id: 3,
            type: 'message',
            date: '2024-01-15T10:32:00',
            from: 'John',
            from_id: 'user100',
            text: [
              'Check this out: ',
              { type: 'bold', text: 'important link' },
              ' - ',
              { type: 'text_link', text: 'click here', href: 'https://example.com' },
            ],
          },
          {
            id: 100,
            type: 'service',
            date: '2024-01-15T10:00:00',
            text: '',
            actor: 'John',
            action: 'create_group',
          },
        ],
      },
      {
        name: 'Work Group',
        type: 'private_group',
        id: 67890,
        messages: [
          {
            id: 1,
            type: 'message',
            date: '2024-01-14T09:00:00',
            from: 'Bob',
            from_id: 'user300',
            text: 'Meeting at 2pm today',
          },
          {
            id: 2,
            type: 'message',
            date: '2024-01-14T09:05:00',
            from: 'John',
            from_id: 'user100',
            text: 'Sounds good, I will be there',
            reply_to_message_id: 1,
          },
        ],
      },
    ],
  },
});

// ============================================================================
// EvernoteExportParser Tests
// ============================================================================

describe('EvernoteExportParser', () => {
  const parser = new EvernoteExportParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts .enex file extension', () => {
      expect(parser.canParse('/exports/notes.enex')).toBe(true);
    });

    it('accepts data containing <en-export> root element', () => {
      expect(parser.canParse('/some/file.xml', '<en-export version="1.0">')).toBe(true);
    });

    it('rejects non-enex extensions without matching data', () => {
      expect(parser.canParse('/exports/notes.xml')).toBe(false);
    });

    it('rejects data without en-export element', () => {
      expect(parser.canParse('/some/file.xml', '<root><item>test</item></root>')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses ENEX with multiple notes, strips HTML, extracts tags', async () => {
      mockReadFileSync.mockReturnValue(EVERNOTE_ENEX_BASIC);
      const result = await parser.parse('/exports/notes.enex');

      expect(result.format).toBe('evernote_enex');
      expect(result.totalFound).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      const quick = result.items[0]!;
      expect(quick.title).toBe('Quick thought');
      expect(quick.content).toContain('Simple plain text note');
      expect(quick.content).toContain('& special chars <here>');
      expect(quick.id).toMatch(/^en_/);
      expect(quick.metadata.tags).toEqual([]);

      const meeting = result.items[1]!;
      expect(meeting.title).toBe('Meeting Notes');
      expect(meeting.content).toContain('Discussed project timeline');
      expect(meeting.content).toContain('Review spec');
      expect(meeting.metadata.tags).toEqual(['work', 'meetings']);
      expect(meeting.metadata.tag_count).toBe(2);
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(EVERNOTE_ENEX_BASIC);
      const result = await parser.parse('/exports/notes.enex', {
        since: new Date('2023-10-15T00:00:00Z'),
      });
      expect(result.items).toHaveLength(2);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(EVERNOTE_ENEX_BASIC);
      const result = await parser.parse('/exports/notes.enex', { limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.totalFound).toBe(3);
    });

    it('handles missing file gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file'); });
      const result = await parser.parse('/missing/notes.enex');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('handles malformed ENEX with empty notes', async () => {
      mockReadFileSync.mockReturnValue(EVERNOTE_ENEX_MALFORMED);
      const result = await parser.parse('/exports/broken.enex');
      expect(result.items).toHaveLength(2);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('generates deterministic IDs', async () => {
      mockReadFileSync.mockReturnValue(EVERNOTE_ENEX_BASIC);
      const result1 = await parser.parse('/exports/notes.enex');
      mockReadFileSync.mockReturnValue(EVERNOTE_ENEX_BASIC);
      const result2 = await parser.parse('/exports/notes.enex');
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });
  });
});

// ============================================================================
// YnabExportParser Tests
// ============================================================================

describe('YnabExportParser', () => {
  const parser = new YnabExportParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts Register.csv path', () => {
      expect(parser.canParse('/ynab/Register.csv')).toBe(true);
    });

    it('accepts BudgetName_Register.csv path', () => {
      expect(parser.canParse('/ynab/MyBudget_Register.csv')).toBe(true);
    });

    it('accepts data with YNAB columns', () => {
      expect(parser.canParse('/some.csv', '"Account","Flag","Date","Payee","Outflow","Inflow"')).toBe(true);
    });

    it('rejects non-YNAB CSV', () => {
      expect(parser.canParse('/data.csv', '"Name","Email","Phone"')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses register CSV with transactions', async () => {
      mockReadFileSync.mockReturnValue(YNAB_REGISTER_CSV);
      const result = await parser.parse('/ynab/Register.csv');

      expect(result.format).toBe('ynab_export');
      expect(result.totalFound).toBe(4);
      expect(result.items).toHaveLength(4);
      expect(result.errors).toHaveLength(0);

      const payroll = result.items.find(i => (i.metadata.payee as string)?.includes('Payroll'));
      expect(payroll).toBeDefined();
      expect(payroll!.metadata.amount).toBe(3500);
      expect(payroll!.metadata.inflow).toBe(3500);

      const grocery = result.items.find(i => (i.metadata.payee as string)?.includes('Grocery'));
      expect(grocery).toBeDefined();
      expect(grocery!.metadata.amount).toBe(-85.5);
      expect(grocery!.metadata.outflow).toBe(85.5);
    });

    it('parses budget CSV', async () => {
      mockReadFileSync.mockReturnValue(YNAB_BUDGET_CSV);
      const result = await parser.parse('/ynab/Budget.csv');
      expect(result.format).toBe('ynab_export');
      expect(result.items).toHaveLength(3);
      expect(result.items[0]!.metadata.type).toBe('budget');
      expect(result.items[0]!.metadata.source).toBe('ynab');
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(YNAB_REGISTER_CSV);
      const result = await parser.parse('/ynab/Register.csv', { since: new Date('2024-01-15T00:00:00Z') });
      expect(result.items).toHaveLength(3);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(YNAB_REGISTER_CSV);
      const result = await parser.parse('/ynab/Register.csv', { limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.totalFound).toBe(4);
    });

    it('handles missing file gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file'); });
      const result = await parser.parse('/missing/Register.csv');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('generates deterministic IDs with ynb_ prefix', async () => {
      mockReadFileSync.mockReturnValue(YNAB_REGISTER_CSV);
      const result1 = await parser.parse('/ynab/Register.csv');
      mockReadFileSync.mockReturnValue(YNAB_REGISTER_CSV);
      const result2 = await parser.parse('/ynab/Register.csv');
      expect(result1.items[0]!.id).toMatch(/^ynb_/);
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });
  });
});

// ============================================================================
// MintExportParser Tests
// ============================================================================

describe('MintExportParser', () => {
  const parser = new MintExportParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts transactions.csv with Mint columns', () => {
      const header = '"Date","Description","Original Description","Amount","Transaction Type","Category","Account Name"';
      expect(parser.canParse('/mint/transactions.csv', header)).toBe(true);
    });

    it('accepts transactions.csv path with mint in name', () => {
      expect(parser.canParse('/exports/mint/transactions.csv')).toBe(true);
    });

    it('rejects non-Mint CSV data', () => {
      expect(parser.canParse('/data.csv', '"Name","Email","Phone"')).toBe(false);
    });

    it('rejects files that are not CSV', () => {
      expect(parser.canParse('/data.json')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Mint transactions with correct debit/credit handling', async () => {
      mockReadFileSync.mockReturnValue(MINT_TRANSACTIONS_CSV);
      const result = await parser.parse('/mint/transactions.csv');

      expect(result.format).toBe('mint_csv');
      expect(result.totalFound).toBe(4);
      expect(result.items).toHaveLength(4);

      const wholefoods = result.items.find(i => (i.metadata.description as string)?.includes('Whole Foods'));
      expect(wholefoods).toBeDefined();
      expect(wholefoods!.metadata.amount).toBe(-85.5);
      expect(wholefoods!.metadata.transaction_type).toBe('debit');

      const deposit = result.items.find(i => (i.metadata.description as string)?.includes('Direct Deposit'));
      expect(deposit).toBeDefined();
      expect(deposit!.metadata.amount).toBe(3500);
      expect(deposit!.metadata.transaction_type).toBe('credit');
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(MINT_TRANSACTIONS_CSV);
      const result = await parser.parse('/mint/transactions.csv', { since: new Date('2024-01-15T00:00:00Z') });
      expect(result.items).toHaveLength(3);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(MINT_TRANSACTIONS_CSV);
      const result = await parser.parse('/mint/transactions.csv', { limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.totalFound).toBe(4);
    });

    it('handles missing file gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file'); });
      const result = await parser.parse('/missing/transactions.csv');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('generates deterministic IDs with mnt_ prefix', async () => {
      mockReadFileSync.mockReturnValue(MINT_TRANSACTIONS_CSV);
      const result1 = await parser.parse('/mint/transactions.csv');
      mockReadFileSync.mockReturnValue(MINT_TRANSACTIONS_CSV);
      const result2 = await parser.parse('/mint/transactions.csv');
      expect(result1.items[0]!.id).toMatch(/^mnt_/);
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });

    it('preserves original description and notes in metadata', async () => {
      mockReadFileSync.mockReturnValue(MINT_TRANSACTIONS_CSV);
      const result = await parser.parse('/mint/transactions.csv');
      const wholefoods = result.items.find(i => (i.metadata.description as string)?.includes('Whole Foods'));
      expect(wholefoods!.metadata.original_description).toBe('WHOLEFDS MKT #1234');
      expect(wholefoods!.metadata.notes).toBe('Weekly shopping');
    });
  });
});

// ============================================================================
// GoogleTakeoutParser Tests
// ============================================================================

describe('GoogleTakeoutParser', () => {
  const parser = new GoogleTakeoutParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts Takeout directory path', () => {
      expect(parser.canParse('/exports/Takeout')).toBe(true);
    });

    it('accepts path containing Takeout directory', () => {
      expect(parser.canParse('/exports/Takeout/YouTube')).toBe(true);
    });

    it('accepts Google activity JSON data', () => {
      const data = JSON.stringify([{ title: 'Searched for test', time: '2024-01-15T00:00:00Z' }]);
      expect(parser.canParse('/activity.json', data)).toBe(true);
    });

    it('rejects non-Google JSON data', () => {
      expect(parser.canParse('/data.json', '{"key": "value"}')).toBe(false);
    });
  });

  describe('parse (single file mode)', () => {
    it('parses YouTube watch history JSON', async () => {
      mockReadFileSync.mockReturnValue(GOOGLE_YOUTUBE_HISTORY);
      mockStatSync.mockImplementation(() => ({ isDirectory: () => false, isFile: () => true }));

      const result = await parser.parse('/Takeout/YouTube/history/watch-history.json');
      expect(result.format).toBe('google_takeout');
      expect(result.items).toHaveLength(3);

      const first = result.items[0]!;
      expect(first.title).toContain('TypeScript Tutorial');
      expect(first.id).toMatch(/^gto_/);
      expect(first.metadata.sub_source).toBe('youtube');
      expect(first.metadata.video_id).toBe('abc123');
      expect(first.metadata.channel).toBe('Fireship');
    });

    it('parses search activity JSON', async () => {
      mockReadFileSync.mockReturnValue(GOOGLE_SEARCH_ACTIVITY);
      mockStatSync.mockImplementation(() => ({ isDirectory: () => false, isFile: () => true }));

      const result = await parser.parse('/Takeout/My Activity/Search/MyActivity.json');
      expect(result.items).toHaveLength(2);
      expect(result.items[0]!.title).toContain('best typescript frameworks');
      expect(result.items[0]!.metadata.sub_source).toBe('search');
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(GOOGLE_YOUTUBE_HISTORY);
      mockStatSync.mockImplementation(() => ({ isDirectory: () => false, isFile: () => true }));

      const result = await parser.parse('/Takeout/YouTube/history/watch-history.json', {
        since: new Date('2024-01-14T00:00:00Z'),
      });
      expect(result.items).toHaveLength(2);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(GOOGLE_YOUTUBE_HISTORY);
      mockStatSync.mockImplementation(() => ({ isDirectory: () => false, isFile: () => true }));

      const result = await parser.parse('/Takeout/YouTube/history/watch-history.json', { limit: 1 });
      expect(result.items).toHaveLength(1);
    });

    it('handles missing file gracefully', async () => {
      mockStatSync.mockImplementation(() => { throw new Error('ENOENT'); });

      const result = await parser.parse('/missing/Takeout');
      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });

    it('generates deterministic IDs with gto_ prefix', async () => {
      mockReadFileSync.mockReturnValue(GOOGLE_YOUTUBE_HISTORY);
      mockStatSync.mockImplementation(() => ({ isDirectory: () => false, isFile: () => true }));

      const result1 = await parser.parse('/Takeout/YouTube/history/watch-history.json');
      mockReadFileSync.mockReturnValue(GOOGLE_YOUTUBE_HISTORY);
      const result2 = await parser.parse('/Takeout/YouTube/history/watch-history.json');

      expect(result1.items[0]!.id).toMatch(/^gto_/);
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });
  });

  describe('parse (directory mode)', () => {
    it('scans Takeout directory for known data files', async () => {
      mockStatSync.mockImplementation((p: string) => {
        if (p.includes('watch-history.json') || p.includes('MyActivity.json')) {
          return { isDirectory: () => false, isFile: () => true };
        }
        return { isDirectory: () => true, isFile: () => false };
      });
      mockExistsSync.mockReturnValue(false);
      mockReaddirSync.mockImplementation((dir: string) => {
        if (dir === '/Takeout') return ['YouTube'];
        if (dir === '/Takeout/YouTube') return ['history'];
        if (dir === '/Takeout/YouTube/history') return ['watch-history.json'];
        return [];
      });
      mockReadFileSync.mockImplementation((p: string) => {
        if (p.includes('watch-history.json')) return GOOGLE_YOUTUBE_HISTORY;
        throw new Error('ENOENT');
      });

      const result = await parser.parse('/Takeout');
      expect(result.format).toBe('google_takeout');
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]!.metadata.sub_source).toBe('youtube');
    });
  });
});

// ============================================================================
// GoodreadsExportParser Tests
// ============================================================================

describe('GoodreadsExportParser', () => {
  const parser = new GoodreadsExportParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts goodreads_library_export.csv path', () => {
      expect(parser.canParse('/exports/goodreads_library_export.csv')).toBe(true);
    });

    it('accepts data with Goodreads columns', () => {
      const header = 'Book Id,Title,Author,ISBN,My Rating,Bookshelves';
      expect(parser.canParse('/books.csv', header)).toBe(true);
    });

    it('rejects non-Goodreads CSV', () => {
      expect(parser.canParse('/data.csv', '"Name","Email","Phone"')).toBe(false);
    });

    it('rejects non-CSV files', () => {
      expect(parser.canParse('/books.json')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Goodreads export with books, ratings, and shelves', async () => {
      mockReadFileSync.mockReturnValue(GOODREADS_CSV);
      const result = await parser.parse('/goodreads_library_export.csv');

      expect(result.format).toBe('goodreads_csv');
      expect(result.totalFound).toBe(3);
      expect(result.items).toHaveLength(3);

      const pragmatic = result.items.find(i => i.title.includes('Pragmatic Programmer'));
      expect(pragmatic).toBeDefined();
      expect(pragmatic!.metadata.my_rating).toBe(5);
      expect(pragmatic!.metadata.author).toBe('David Thomas');
      expect(pragmatic!.metadata.bookshelves).toEqual(['programming', 'favorites']);
      expect(pragmatic!.metadata.read_status).toBe('read');
      expect(pragmatic!.metadata.pages).toBe(352);
      expect(pragmatic!.metadata.isbn).toBe('0135957052');

      const toRead = result.items.find(i => i.title.includes('Project Hail Mary'));
      expect(toRead).toBeDefined();
      expect(toRead!.metadata.read_status).toBe('to-read');
      expect(toRead!.metadata.my_rating).toBe(0);
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(GOODREADS_CSV);
      const result = await parser.parse('/goodreads_library_export.csv', { since: new Date('2024-01-10T00:00:00Z') });
      expect(result.items).toHaveLength(2);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(GOODREADS_CSV);
      const result = await parser.parse('/goodreads_library_export.csv', { limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.totalFound).toBe(3);
    });

    it('handles missing file gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file'); });
      const result = await parser.parse('/missing/goodreads.csv');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('generates deterministic IDs with gr_ prefix', async () => {
      mockReadFileSync.mockReturnValue(GOODREADS_CSV);
      const result1 = await parser.parse('/goodreads_library_export.csv');
      mockReadFileSync.mockReturnValue(GOODREADS_CSV);
      const result2 = await parser.parse('/goodreads_library_export.csv');
      expect(result1.items[0]!.id).toMatch(/^gr_/);
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });

    it('strips ISBN formatting characters', async () => {
      mockReadFileSync.mockReturnValue(GOODREADS_CSV);
      const result = await parser.parse('/goodreads_library_export.csv');
      const book = result.items.find(i => i.title.includes('Pragmatic'));
      expect(book!.metadata.isbn).toBe('0135957052');
      expect(book!.metadata.isbn13).toBe('9780135957059');
    });
  });
});

// ============================================================================
// StravaExportParser Tests
// ============================================================================

describe('StravaExportParser', () => {
  const parser = new StravaExportParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts activities.csv path', () => {
      expect(parser.canParse('/strava/activities.csv')).toBe(true);
    });

    it('accepts data with Strava columns', () => {
      const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance';
      expect(parser.canParse('/data.csv', header)).toBe(true);
    });

    it('rejects non-Strava CSV data', () => {
      expect(parser.canParse('/data.csv', '"Name","Email","Phone"')).toBe(false);
    });

    it('rejects non-CSV files', () => {
      expect(parser.canParse('/data.json')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Strava activities with distance, time, and heart rate', async () => {
      mockReadFileSync.mockReturnValue(STRAVA_ACTIVITIES_CSV);
      const result = await parser.parse('/strava/activities.csv');

      expect(result.format).toBe('strava_export');
      expect(result.totalFound).toBe(3);
      expect(result.items).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      const run = result.items.find(i => (i.metadata.activity_type as string) === 'Run');
      expect(run).toBeDefined();
      expect(run!.title).toContain('Run');
      expect(run!.title).toContain('Morning Run');
      expect(run!.metadata.distance).toBe(5.2);
      expect(run!.metadata.avg_heart_rate).toBe(155);
      expect(run!.metadata.calories).toBe(450);
      expect(run!.metadata.is_commute).toBe(false);

      const ride = result.items.find(i => (i.metadata.activity_type as string) === 'Ride');
      expect(ride).toBeDefined();
      expect(ride!.metadata.is_commute).toBe(true);
      expect(ride!.metadata.elevation_gain).toBe(320);
      expect(ride!.metadata.avg_watts).toBe(195);
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(STRAVA_ACTIVITIES_CSV);
      const result = await parser.parse('/strava/activities.csv', { since: new Date('2024-01-14T00:00:00Z') });
      expect(result.items).toHaveLength(2);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(STRAVA_ACTIVITIES_CSV);
      const result = await parser.parse('/strava/activities.csv', { limit: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.totalFound).toBe(3);
    });

    it('handles missing file gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file'); });
      const result = await parser.parse('/missing/activities.csv');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('generates deterministic IDs with stv_exp_ prefix', async () => {
      mockReadFileSync.mockReturnValue(STRAVA_ACTIVITIES_CSV);
      const result1 = await parser.parse('/strava/activities.csv');
      mockReadFileSync.mockReturnValue(STRAVA_ACTIVITIES_CSV);
      const result2 = await parser.parse('/strava/activities.csv');
      expect(result1.items[0]!.id).toMatch(/^stv_exp_/);
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });

    it('handles malformed rows gracefully', async () => {
      const csvWithEmpty = `Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance
,,,,,"",`;
      mockReadFileSync.mockReturnValue(csvWithEmpty);
      const result = await parser.parse('/strava/activities.csv');
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// TelegramExportParser Tests
// ============================================================================

describe('TelegramExportParser', () => {
  const parser = new TelegramExportParser();

  beforeEach(() => { resetAllMocks(); });

  describe('canParse', () => {
    it('accepts result.json with Telegram structure', () => {
      expect(parser.canParse('/telegram/result.json', TELEGRAM_EXPORT_BASIC)).toBe(true);
    });

    it('accepts telegram path with .json extension', () => {
      expect(parser.canParse('/exports/telegram/data.json')).toBe(true);
    });

    it('rejects non-Telegram JSON data', () => {
      expect(parser.canParse('/result.json', '{"key": "value"}')).toBe(false);
    });

    it('rejects non-JSON files', () => {
      expect(parser.canParse('/data.csv')).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses Telegram export with multiple chats and messages', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result = await parser.parse('/telegram/result.json');

      expect(result.format).toBe('telegram_export');
      expect(result.totalFound).toBe(5);
      expect(result.items).toHaveLength(5);

      const latest = result.items[0]!;
      expect(latest.metadata.platform).toBe('telegram');
      expect(latest.sourceType).toBe('messaging');
      expect(latest.id).toMatch(/^tg_/);
    });

    it('handles text arrays (rich text entities)', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result = await parser.parse('/telegram/result.json');

      const richMsg = result.items.find(i =>
        i.content.includes('important link') && i.content.includes('click here'),
      );
      expect(richMsg).toBeDefined();
      expect(richMsg!.content).toBe('Check this out: important link - click here');
    });

    it('skips service messages', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result = await parser.parse('/telegram/result.json');

      const serviceItems = result.items.filter(i => i.content.includes('create_group'));
      expect(serviceItems).toHaveLength(0);
    });

    it('includes chat metadata (name, type, reply info)', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result = await parser.parse('/telegram/result.json');

      const reply = result.items.find(i => i.metadata.is_reply === true);
      expect(reply).toBeDefined();
      expect(reply!.metadata.chat_name).toBe('Work Group');
      expect(reply!.metadata.chat_type).toBe('private_group');
      expect(reply!.metadata.reply_to).toBe(1);
    });

    it('applies since filter', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result = await parser.parse('/telegram/result.json', {
        since: new Date('2024-01-15T00:00:00'),
      });
      expect(result.items).toHaveLength(3);
    });

    it('applies limit', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result = await parser.parse('/telegram/result.json', { limit: 2 });
      expect(result.items).toHaveLength(2);
    });

    it('handles missing file gracefully', async () => {
      mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT: no such file'); });
      const result = await parser.parse('/missing/result.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Failed to read file');
    });

    it('handles invalid JSON gracefully', async () => {
      mockReadFileSync.mockReturnValue('not valid json at all');
      const result = await parser.parse('/telegram/result.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors[0]!.message).toContain('Invalid JSON');
    });

    it('generates deterministic IDs with tg_ prefix', async () => {
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result1 = await parser.parse('/telegram/result.json');
      mockReadFileSync.mockReturnValue(TELEGRAM_EXPORT_BASIC);
      const result2 = await parser.parse('/telegram/result.json');
      expect(result1.items[0]!.id).toMatch(/^tg_/);
      expect(result1.items.map(i => i.id)).toEqual(result2.items.map(i => i.id));
    });

    it('handles export with missing chats gracefully', async () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ personal_information: {} }));
      const result = await parser.parse('/telegram/result.json');
      expect(result.items).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });
});

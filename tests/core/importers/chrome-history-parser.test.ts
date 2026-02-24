import { describe, it, expect } from 'vitest';
import { ChromeHistoryParser } from '@semblance/core/importers/browser/chrome-history-parser.js';

function makeChromeJson(entries: Array<{ title: string; url: string; time_usec: number; page_transition?: string }>): string {
  return JSON.stringify({
    'Browser History': entries.map(e => ({
      title: e.title,
      url: e.url,
      time_usec: e.time_usec,
      page_transition: e.page_transition ?? 'LINK',
    })),
  });
}

describe('ChromeHistoryParser', () => {
  const parser = new ChromeHistoryParser();

  it('canParse returns true for valid Chrome JSON', () => {
    const data = makeChromeJson([
      { title: 'Google', url: 'https://google.com', time_usec: 1700000000000000 },
    ]);
    expect(parser.canParse('BrowserHistory.json', data)).toBe(true);
  });

  it('canParse returns false for non-Chrome JSON', () => {
    const data = JSON.stringify({ bookmarks: [] });
    expect(parser.canParse('data.json', data)).toBe(false);
  });

  it('parses entries with correct title, url, timestamp', async () => {
    const timeUsec = 1700000000000000; // microseconds
    const data = makeChromeJson([
      { title: 'Example Page', url: 'https://example.com/page', time_usec: timeUsec },
    ]);

    // Write temp file
    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'chrome-test-'));
    const tmpFile = join(tmpDir, 'BrowserHistory.json');
    writeFileSync(tmpFile, data);

    try {
      const result = await parser.parse(tmpFile);
      expect(result.format).toBe('chrome_json');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('Example Page');
      expect(result.items[0]!.metadata.url).toBe('https://example.com/page');
      expect(result.items[0]!.timestamp).toBeTruthy();
      expect(result.items[0]!.id).toMatch(/^chr_/);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('deduplicates by URL (multiple visits -> single item with visit_count)', async () => {
    const data = makeChromeJson([
      { title: 'Page', url: 'https://example.com/page', time_usec: 1700000000000000 },
      { title: 'Page', url: 'https://example.com/page', time_usec: 1700000001000000 },
      { title: 'Page', url: 'https://example.com/page', time_usec: 1700000002000000 },
    ]);

    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'chrome-test-'));
    const tmpFile = join(tmpDir, 'BrowserHistory.json');
    writeFileSync(tmpFile, data);

    try {
      const result = await parser.parse(tmpFile);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.metadata.visit_count).toBe(3);
      expect(result.totalFound).toBe(3);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('respects since date filter', async () => {
    const data = makeChromeJson([
      { title: 'Old Page', url: 'https://old.com', time_usec: 1600000000000000 },
      { title: 'New Page', url: 'https://new.com', time_usec: 1700000000000000 },
    ]);

    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'chrome-test-'));
    const tmpFile = join(tmpDir, 'BrowserHistory.json');
    writeFileSync(tmpFile, data);

    try {
      const result = await parser.parse(tmpFile, {
        since: new Date(1650000000000), // After the old entry
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.title).toBe('New Page');
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it('respects limit option', async () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      title: `Page ${i}`,
      url: `https://example${i}.com`,
      time_usec: (1700000000000000 + i * 1000000),
    }));
    const data = makeChromeJson(entries);

    const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'chrome-test-'));
    const tmpFile = join(tmpDir, 'BrowserHistory.json');
    writeFileSync(tmpFile, data);

    try {
      const result = await parser.parse(tmpFile, { limit: 5 });
      expect(result.items).toHaveLength(5);
    } finally {
      unlinkSync(tmpFile);
    }
  });
});

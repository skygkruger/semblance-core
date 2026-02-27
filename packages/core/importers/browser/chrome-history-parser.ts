/**
 * Chrome History Parser — Parses Chrome Takeout JSON export.
 *
 * Chrome Takeout exports browser history as BrowserHistory.json:
 * { "Browser History": [{ "title": "...", "url": "...", "time_usec": 12345, ... }] }
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import { safeReadFileSync } from '../safe-read.js';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

export interface ChromeHistoryEntry {
  title: string;
  url: string;
  time_usec: number;
  page_transition: string;
  favicon_url?: string;
}

interface ChromeTakeoutJson {
  'Browser History': ChromeHistoryEntry[];
}

function deterministicId(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return `chr_${hash}`;
}

function getDomainPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export class ChromeHistoryParser implements ImportParser {
  readonly sourceType = 'browser_history' as const;
  readonly supportedFormats = ['chrome_json'];

  canParse(path: string, data?: string): boolean {
    if (!path.endsWith('.json') && !data) return false;

    if (data) {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed?.['Browser History']);
      } catch {
        return false;
      }
    }

    return path.toLowerCase().includes('browserhistory') ||
           path.toLowerCase().includes('browser_history') ||
           path.toLowerCase().includes('history.json');
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];
    let rawData: string;

    try {
      rawData = safeReadFileSync(path);
    } catch (err) {
      return {
        format: 'chrome_json',
        items: [],
        errors: [{ message: `Failed to read file: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    let parsed: ChromeTakeoutJson;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return {
        format: 'chrome_json',
        items: [],
        errors: [{ message: 'Invalid JSON format' }],
        totalFound: 0,
      };
    }

    const entries = parsed['Browser History'];
    if (!Array.isArray(entries)) {
      return {
        format: 'chrome_json',
        items: [],
        errors: [{ message: 'Missing "Browser History" array in JSON' }],
        totalFound: 0,
      };
    }

    const totalFound = entries.length;

    // Group by domain+path for deduplication
    const grouped = new Map<string, { entry: ChromeHistoryEntry; visitCount: number; latestTime: number }>();

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;

      if (!entry.url || !entry.time_usec) {
        errors.push({ message: 'Missing url or time_usec', index: i });
        continue;
      }

      // Apply since filter
      const timestampMs = entry.time_usec / 1000; // Chrome stores in microseconds
      if (options?.since && timestampMs < options.since.getTime()) {
        continue;
      }

      const key = getDomainPath(entry.url);
      const existing = grouped.get(key);

      if (existing) {
        existing.visitCount += 1;
        if (timestampMs > existing.latestTime) {
          existing.entry = entry;
          existing.latestTime = timestampMs;
        }
      } else {
        grouped.set(key, { entry, visitCount: 1, latestTime: timestampMs });
      }
    }

    // Convert to ImportedItem[]
    let items: ImportedItem[] = [];
    for (const [, { entry, visitCount, latestTime }] of grouped) {
      const item: ImportedItem = {
        id: deterministicId(entry.url),
        sourceType: 'browser_history',
        title: entry.title || entry.url,
        content: `Visited: ${entry.title || 'Untitled'} - ${entry.url}`,
        timestamp: new Date(latestTime).toISOString(),
        metadata: {
          url: entry.url,
          visit_count: visitCount,
          page_transition: entry.page_transition,
          domain: getDomainPath(entry.url).split('/')[0],
        },
      };
      items.push(item);
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (options?.limit && items.length > options.limit) {
      items = items.slice(0, options.limit);
    }

    return {
      format: 'chrome_json',
      items,
      errors,
      totalFound,
    };
  }
}

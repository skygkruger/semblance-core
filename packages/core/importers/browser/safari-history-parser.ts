/**
 * Safari History Parser — Reads Safari's History.db (SQLite) on macOS.
 *
 * Safari stores browsing history in ~/Library/Safari/History.db with tables:
 * - history_items: URLs, visit counts
 * - history_visits: individual visit records with timestamps
 *
 * Safari/WebKit timestamps are seconds since 2001-01-01 00:00:00 UTC (Core Data epoch).
 * To convert to Unix epoch: add 978307200 seconds.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

/** Seconds between Unix epoch (1970-01-01) and Core Data/WebKit epoch (2001-01-01) */
const WEBKIT_EPOCH_OFFSET = 978307200;

function webkitTimestampToMs(timestamp: number): number {
  return (timestamp + WEBKIT_EPOCH_OFFSET) * 1000;
}

function deterministicId(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return `saf_${hash}`;
}

export class SafariHistoryParser implements ImportParser {
  readonly sourceType = 'browser_history' as const;
  readonly supportedFormats = ['safari_sqlite'];

  canParse(path: string): boolean {
    const normalized = path.replace(/\\/g, '/').toLowerCase();

    // Check for History.db in a Safari-related path
    if (normalized.endsWith('history.db') && normalized.includes('safari')) {
      return true;
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Database: any;
    try {
      const mod = await import('better-sqlite3');
      Database = mod.default;
    } catch {
      return {
        format: 'safari_sqlite',
        items: [],
        errors: [{ message: 'better-sqlite3 not available for Safari history parsing' }],
        totalFound: 0,
      };
    }

    // Copy to avoid locking the live database
    let dbPath = path;
    let copiedPath: string | null = null;
    try {
      const { copyFileSync, mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'saf-history-'));
      copiedPath = join(tmpDir, 'History_copy.db');
      copyFileSync(path, copiedPath);
      dbPath = copiedPath;
    } catch {
      // If copy fails, try opening the original read-only
    }

    let db: InstanceType<typeof Database>;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
    } catch (err) {
      return {
        format: 'safari_sqlite',
        items: [],
        errors: [{ message: `Failed to open database: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    try {
      let query = `
        SELECT
          hi.url,
          hi.visit_count,
          MAX(hv.visit_time) as last_visit_time,
          hv.title
        FROM history_items hi
        LEFT JOIN history_visits hv ON hi.id = hv.history_item
        WHERE hi.url IS NOT NULL
      `;
      const params: unknown[] = [];

      if (options?.since) {
        // Convert since date to WebKit timestamp (seconds since 2001-01-01)
        const sinceWebkit = (options.since.getTime() / 1000) - WEBKIT_EPOCH_OFFSET;
        query += ' AND hv.visit_time >= ?';
        params.push(sinceWebkit);
      }

      query += ' GROUP BY hi.url ORDER BY last_visit_time DESC';

      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = db.prepare(query).all(...params) as Array<{
        url: string;
        visit_count: number;
        last_visit_time: number | null;
        title: string | null;
      }>;

      const totalFound = (db.prepare(
        'SELECT COUNT(*) as cnt FROM history_items WHERE url IS NOT NULL'
      ).get() as { cnt: number }).cnt;

      const items: ImportedItem[] = rows.map(row => {
        const timestampMs = row.last_visit_time
          ? webkitTimestampToMs(row.last_visit_time)
          : Date.now();

        let domain = '';
        try {
          domain = new URL(row.url).hostname;
        } catch {
          // Non-parseable URL
        }

        return {
          id: deterministicId(row.url),
          sourceType: 'browser_history' as const,
          title: row.title || row.url,
          content: `Visited: ${row.title || 'Untitled'} - ${row.url}`,
          timestamp: new Date(timestampMs).toISOString(),
          metadata: {
            url: row.url,
            visit_count: row.visit_count,
            domain,
            source_browser: 'safari',
          },
        };
      });

      return {
        format: 'safari_sqlite',
        items,
        errors,
        totalFound,
      };
    } finally {
      db.close();
      if (copiedPath) {
        try {
          const { unlinkSync } = await import('node:fs');
          unlinkSync(copiedPath);
        } catch {
          // Best-effort cleanup
        }
      }
    }
  }
}

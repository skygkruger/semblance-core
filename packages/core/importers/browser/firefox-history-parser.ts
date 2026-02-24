/**
 * Firefox History Parser — Reads places.sqlite from Firefox profile.
 *
 * Firefox stores history in a SQLite database (places.sqlite) with tables:
 * - moz_places: URLs, titles, visit counts
 * - moz_historyvisits: individual visit records with timestamps
 *
 * We open a read-only copy to avoid locking the live database.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return `ffx_${hash}`;
}

export class FirefoxHistoryParser implements ImportParser {
  readonly sourceType = 'browser_history' as const;
  readonly supportedFormats = ['firefox_sqlite'];

  canParse(path: string, data?: string): boolean {
    // Check if it's a places.sqlite file or a directory containing one
    if (path.endsWith('places.sqlite')) return true;

    // If data is provided, check for SQLite magic bytes encoded as hint
    if (data) {
      try {
        const parsed = JSON.parse(data);
        return parsed?.type === 'firefox_places';
      } catch {
        return false;
      }
    }

    return false;
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];

    // Import better-sqlite3 dynamically to keep the module lightweight
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Database: any;
    try {
      const mod = await import('better-sqlite3');
      Database = mod.default;
    } catch {
      return {
        format: 'firefox_sqlite',
        items: [],
        errors: [{ message: 'better-sqlite3 not available for Firefox history parsing' }],
        totalFound: 0,
      };
    }

    // Copy the file to avoid locking the live DB
    let dbPath = path;
    let copiedPath: string | null = null;
    try {
      const { copyFileSync, mkdtempSync, unlinkSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'ffx-history-'));
      copiedPath = join(tmpDir, 'places_copy.sqlite');
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
        format: 'firefox_sqlite',
        items: [],
        errors: [{ message: `Failed to open database: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    try {
      // Build query with optional since filter
      let query = `
        SELECT
          p.url,
          p.title,
          p.visit_count,
          MAX(v.visit_date) as last_visit_date
        FROM moz_places p
        LEFT JOIN moz_historyvisits v ON p.id = v.place_id
        WHERE p.url IS NOT NULL
          AND p.url NOT LIKE 'place:%'
      `;
      const params: unknown[] = [];

      if (options?.since) {
        // Firefox stores timestamps in microseconds
        const sinceUsec = options.since.getTime() * 1000;
        query += ' AND v.visit_date >= ?';
        params.push(sinceUsec);
      }

      query += ' GROUP BY p.url ORDER BY last_visit_date DESC';

      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = db.prepare(query).all(...params) as Array<{
        url: string;
        title: string | null;
        visit_count: number;
        last_visit_date: number | null;
      }>;

      const totalFound = (db.prepare('SELECT COUNT(*) as cnt FROM moz_places WHERE url NOT LIKE \'place:%\'').get() as { cnt: number }).cnt;

      const items: ImportedItem[] = rows.map(row => {
        const timestampMs = row.last_visit_date ? row.last_visit_date / 1000 : Date.now();
        return {
          id: deterministicId(row.url),
          sourceType: 'browser_history' as const,
          title: row.title || row.url,
          content: `Visited: ${row.title || 'Untitled'} - ${row.url}`,
          timestamp: new Date(timestampMs).toISOString(),
          metadata: {
            url: row.url,
            visit_count: row.visit_count,
            source_browser: 'firefox',
          },
        };
      });

      return {
        format: 'firefox_sqlite',
        items,
        errors,
        totalFound,
      };
    } finally {
      db.close();
      // Clean up copied file
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

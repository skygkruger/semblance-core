/**
 * Edge History Parser — Reads Microsoft Edge browsing history from its Chromium SQLite database.
 *
 * Edge (Chromium-based) stores history in a SQLite file called "History" at platform-specific paths:
 * - Windows: %LOCALAPPDATA%/Microsoft/Edge/User Data/Default/History
 * - macOS:   ~/Library/Application Support/Microsoft Edge/Default/History
 * - Linux:   ~/.config/microsoft-edge/Default/History
 *
 * Chromium timestamps are microseconds since 1601-01-01 00:00:00 UTC (Windows FILETIME epoch).
 * To convert to Unix epoch microseconds: subtract 11644473600000000.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

/**
 * Microseconds between Windows FILETIME epoch (1601-01-01) and Unix epoch (1970-01-01).
 * 11644473600 seconds * 1000000 microseconds/second = 11644473600000000
 */
const CHROMIUM_EPOCH_OFFSET_USEC = 11644473600000000n;

function chromiumTimestampToMs(chromiumUsec: number | bigint): number {
  const usec = BigInt(chromiumUsec);
  const unixUsec = usec - CHROMIUM_EPOCH_OFFSET_USEC;
  return Number(unixUsec / 1000n); // microseconds to milliseconds
}

function deterministicId(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return `edg_${hash}`;
}

/** Known Edge data directory path fragments across platforms */
const EDGE_PATH_FRAGMENTS = [
  'microsoft edge',
  'microsoft/edge',
  'microsoft\\edge',
  'msedge',
];

export class EdgeHistoryParser implements ImportParser {
  readonly sourceType = 'browser_history' as const;
  readonly supportedFormats = ['edge_sqlite'];

  canParse(path: string): boolean {
    const normalized = path.replace(/\\/g, '/').toLowerCase();

    // Must be a file named "History" (no extension) or end with /History
    const filename = normalized.split('/').pop() || '';
    if (filename !== 'history') return false;

    // Must be in an Edge data directory
    return EDGE_PATH_FRAGMENTS.some(frag => normalized.includes(frag));
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
        format: 'edge_sqlite',
        items: [],
        errors: [{ message: 'better-sqlite3 not available for Edge history parsing' }],
        totalFound: 0,
      };
    }

    // Copy to avoid locking the live database
    let dbPath = path;
    let copiedPath: string | null = null;
    try {
      const { copyFileSync, mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'edg-history-'));
      copiedPath = join(tmpDir, 'History_copy');
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
        format: 'edge_sqlite',
        items: [],
        errors: [{ message: `Failed to open database: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    try {
      let query = `
        SELECT
          u.url,
          u.title,
          u.visit_count,
          MAX(v.visit_time) as last_visit_time
        FROM urls u
        LEFT JOIN visits v ON u.id = v.url
        WHERE u.url IS NOT NULL
      `;
      const params: unknown[] = [];

      if (options?.since) {
        // Convert since date to Chromium timestamp (microseconds since 1601-01-01)
        const sinceUsec = BigInt(options.since.getTime()) * 1000n + CHROMIUM_EPOCH_OFFSET_USEC;
        query += ' AND v.visit_time >= ?';
        params.push(Number(sinceUsec));
      }

      query += ' GROUP BY u.url ORDER BY last_visit_time DESC';

      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = db.prepare(query).all(...params) as Array<{
        url: string;
        title: string | null;
        visit_count: number;
        last_visit_time: number | null;
      }>;

      const totalFound = (db.prepare(
        'SELECT COUNT(*) as cnt FROM urls WHERE url IS NOT NULL'
      ).get() as { cnt: number }).cnt;

      const items: ImportedItem[] = [];
      for (const row of rows) {
        try {
          const timestampMs = row.last_visit_time
            ? chromiumTimestampToMs(row.last_visit_time)
            : Date.now();

          let domain = '';
          try {
            domain = new URL(row.url).hostname;
          } catch {
            // Non-parseable URL
          }

          items.push({
            id: deterministicId(row.url),
            sourceType: 'browser_history',
            title: row.title || row.url,
            content: `Visited: ${row.title || 'Untitled'} - ${row.url}`,
            timestamp: new Date(timestampMs).toISOString(),
            metadata: {
              url: row.url,
              visit_count: row.visit_count,
              domain,
              source_browser: 'edge',
            },
          });
        } catch (err) {
          errors.push({
            message: `Failed to parse URL row: ${(err as Error).message}`,
            raw: row.url,
          });
        }
      }

      return {
        format: 'edge_sqlite',
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

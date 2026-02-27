/**
 * Desktop iMessage Reader — Reads iMessage history from macOS chat.db.
 *
 * macOS stores iMessage/SMS history in ~/Library/Messages/chat.db (SQLite).
 * Tables used: message, handle, chat_message_join, chat_handle_join, chat.
 *
 * iMessage timestamps are "Core Data" timestamps: seconds since 2001-01-01 00:00:00 UTC.
 * To convert to Unix epoch: add 978307200 seconds.
 *
 * PRIVACY: Defaults to OFF. Requires explicit user consent via options.extra.consentGiven.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../importers/types.js';

/** Seconds between Unix epoch (1970-01-01) and Core Data epoch (2001-01-01) */
const CORE_DATA_EPOCH_OFFSET = 978307200;

/**
 * iMessage stores timestamps in nanoseconds since 2001-01-01 starting from iOS 10 / macOS Sierra.
 * Older versions used seconds. We detect by checking if the value is unreasonably large for seconds.
 */
function coreDataTimestampToMs(timestamp: number): number {
  // If timestamp is in nanoseconds (> 1e15), convert to seconds first
  if (timestamp > 1e15) {
    timestamp = timestamp / 1e9;
  }
  return (timestamp + CORE_DATA_EPOCH_OFFSET) * 1000;
}

function deterministicId(rowid: number, handleId: string, dateMs: number): string {
  const input = `imessage:${rowid}:${handleId}:${dateMs}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `msg_${hash}`;
}

export class DesktopIMessageReader implements ImportParser {
  readonly sourceType = 'messaging' as const;
  readonly supportedFormats = ['imessage_sqlite'];

  canParse(path: string): boolean {
    const normalized = path.replace(/\\/g, '/').toLowerCase();
    return normalized.endsWith('chat.db') ||
           normalized.includes('messages/chat.db');
  }

  async parse(path: string, options?: ParseOptions): Promise<ImportResult> {
    const errors: ParseError[] = [];

    // Require explicit consent — iMessage is deeply personal
    if (!options?.extra?.consentGiven) {
      return {
        format: 'imessage_sqlite',
        items: [],
        errors: [{ message: 'iMessage import requires explicit user consent. Set options.extra.consentGiven = true.' }],
        totalFound: 0,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Database: any;
    try {
      const mod = await import('better-sqlite3');
      Database = mod.default;
    } catch {
      return {
        format: 'imessage_sqlite',
        items: [],
        errors: [{ message: 'better-sqlite3 not available for iMessage parsing' }],
        totalFound: 0,
      };
    }

    // Copy to avoid locking the live database
    let dbPath = path;
    let copiedPath: string | null = null;
    try {
      const { copyFileSync, mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'imsg-'));
      copiedPath = join(tmpDir, 'chat_copy.db');
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
        format: 'imessage_sqlite',
        items: [],
        errors: [{ message: `Failed to open database: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    try {
      // Build query
      let query = `
        SELECT
          m.ROWID as rowid,
          m.text,
          m.date as message_date,
          m.is_from_me,
          m.service,
          h.id as handle_id,
          h.uncanonicalized_id
        FROM message m
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.text IS NOT NULL AND m.text != ''
      `;
      const params: unknown[] = [];

      if (options?.since) {
        // Convert since date to Core Data timestamp (seconds since 2001-01-01)
        const sinceSeconds = (options.since.getTime() / 1000) - CORE_DATA_EPOCH_OFFSET;
        const sinceNano = sinceSeconds * 1e9;
        // iMessage uses nanoseconds on modern macOS (date > 1e15) or seconds on older.
        // We detect by checking the magnitude of existing values and filter accordingly.
        // Dates stored as nanoseconds will be > 1e15, seconds will be < 1e12.
        // Use a CASE expression to normalize before comparing:
        query += ` AND CASE
          WHEN m.date > 1000000000000000 THEN m.date >= ?
          ELSE m.date >= ?
        END`;
        params.push(sinceNano);
        params.push(sinceSeconds);
      }

      query += ' ORDER BY m.date DESC';

      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = db.prepare(query).all(...params) as Array<{
        rowid: number;
        text: string | null;
        message_date: number | null;
        is_from_me: number;
        service: string | null;
        handle_id: string | null;
        uncanonicalized_id: string | null;
      }>;

      const totalFound = (db.prepare(
        "SELECT COUNT(*) as cnt FROM message WHERE text IS NOT NULL AND text != ''"
      ).get() as { cnt: number }).cnt;

      const items: ImportedItem[] = [];
      for (const row of rows) {
        try {
          const dateMs = row.message_date ? coreDataTimestampToMs(row.message_date) : Date.now();
          const handleDisplay = row.handle_id || row.uncanonicalized_id || 'Unknown';
          const direction = row.is_from_me ? 'sent' : 'received';

          items.push({
            id: deterministicId(row.rowid, handleDisplay, dateMs),
            sourceType: 'messaging',
            title: `${direction === 'sent' ? 'To' : 'From'}: ${handleDisplay}`,
            content: row.text || '',
            timestamp: new Date(dateMs).toISOString(),
            metadata: {
              handle: handleDisplay,
              is_from_me: row.is_from_me === 1,
              direction,
              service: row.service || 'iMessage',
              source_app: 'imessage',
            },
          });
        } catch (err) {
          errors.push({
            message: `Failed to parse message row ${row.rowid}: ${(err as Error).message}`,
            index: row.rowid,
          });
        }
      }

      return {
        format: 'imessage_sqlite',
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

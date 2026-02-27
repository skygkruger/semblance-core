/**
 * Things 3 Reader — Reads tasks from Things 3 macOS database.
 *
 * Things 3 stores its data at:
 * ~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/Things Database.thingsdatabase/main.sqlite
 *
 * Schema:
 * - TMTask: Core task table
 *   - uuid: Unique identifier
 *   - title: Task title
 *   - notes: Task notes (rich text)
 *   - status: 0=open, 2=cancelled, 3=done
 *   - startDate: When task was started/scheduled (Core Data timestamp or integer date)
 *   - deadline: Deadline date (integer YYYYMMDD format in Things 3)
 *   - project: FK to parent TMTask (for projects/headings)
 *   - creationDate: When the task was created (Core Data timestamp)
 *   - userModificationDate: Last modified (Core Data timestamp)
 *   - type: 0=task, 1=project, 2=heading
 *
 * - TMTag: Tags table
 *   - uuid, title
 *
 * - TMTaskTag: Junction table linking tasks to tags
 *   - tasks (FK to TMTask.uuid), tags (FK to TMTag.uuid)
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

/** Seconds between Unix epoch (1970-01-01) and Core Data epoch (2001-01-01) */
const CORE_DATA_EPOCH_OFFSET = 978307200;

function coreDataTimestampToMs(timestamp: number): number {
  return (timestamp + CORE_DATA_EPOCH_OFFSET) * 1000;
}

/** Things 3 stores some dates as integer YYYYMMDD — convert to ISO string */
function thingsDateToISO(dateInt: number | null): string | null {
  if (dateInt === null || dateInt === 0) return null;
  const str = String(dateInt);
  if (str.length !== 8) return null;
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const day = str.slice(6, 8);
  return `${year}-${month}-${day}`;
}

const THINGS_STATUS_MAP: Record<number, string> = {
  0: 'open',
  2: 'cancelled',
  3: 'done',
};

const THINGS_TYPE_MAP: Record<number, string> = {
  0: 'task',
  1: 'project',
  2: 'heading',
};

function deterministicId(uuid: string): string {
  const hash = createHash('sha256').update(`things:${uuid}`).digest('hex').slice(0, 12);
  return `thg_${hash}`;
}

/** Known Things 3 database path fragments */
const THINGS_PATH_FRAGMENTS = [
  'jlmpqhk86h.com.culturedcode.thingsmac',
  'things database.thingsdatabase',
  'things database',
];

export class ThingsReader implements ImportParser {
  readonly sourceType = 'productivity' as const;
  readonly supportedFormats = ['things_sqlite'];

  canParse(path: string): boolean {
    const normalized = path.replace(/\\/g, '/').toLowerCase();

    // Check for main.sqlite in a Things database path
    if (normalized.endsWith('main.sqlite') &&
        THINGS_PATH_FRAGMENTS.some(frag => normalized.includes(frag))) {
      return true;
    }

    // Also match if the path explicitly mentions Things
    if (normalized.endsWith('.sqlite') && normalized.includes('things')) {
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
        format: 'things_sqlite',
        items: [],
        errors: [{ message: 'better-sqlite3 not available for Things 3 parsing' }],
        totalFound: 0,
      };
    }

    // Copy to avoid locking the live database
    let dbPath = path;
    let copiedPath: string | null = null;
    try {
      const { copyFileSync, mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'things-'));
      copiedPath = join(tmpDir, 'main_copy.sqlite');
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
        format: 'things_sqlite',
        items: [],
        errors: [{ message: `Failed to open database: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    try {
      // Get total count
      const totalFound = (db.prepare(`
        SELECT COUNT(*) as cnt FROM TMTask WHERE trashed = 0
      `).get() as { cnt: number }).cnt;

      // Build query
      let query = `
        SELECT
          t.uuid,
          t.title,
          t.notes,
          t.status,
          t.type,
          t.startDate,
          t.deadline,
          t.creationDate,
          t.userModificationDate,
          t.project as projectUUID,
          p.title as projectTitle
        FROM TMTask t
        LEFT JOIN TMTask p ON t.project = p.uuid
        WHERE t.trashed = 0
      `;
      const params: unknown[] = [];

      if (options?.since) {
        // creationDate is Core Data timestamp (seconds since 2001-01-01)
        const sinceSeconds = (options.since.getTime() / 1000) - CORE_DATA_EPOCH_OFFSET;
        query += ' AND t.creationDate >= ?';
        params.push(sinceSeconds);
      }

      query += ' ORDER BY t.creationDate DESC';

      if (options?.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      const rows = db.prepare(query).all(...params) as Array<{
        uuid: string;
        title: string | null;
        notes: string | null;
        status: number;
        type: number;
        startDate: number | null;
        deadline: number | null;
        creationDate: number | null;
        userModificationDate: number | null;
        projectUUID: string | null;
        projectTitle: string | null;
      }>;

      // Prepare tag lookup
      const getTagsForTask = db.prepare(`
        SELECT tag.title
        FROM TMTaskTag tt
        JOIN TMTag tag ON tt.tags = tag.uuid
        WHERE tt.tasks = ?
      `);

      const items: ImportedItem[] = [];

      for (const row of rows) {
        try {
          const tags = (getTagsForTask.all(row.uuid) as Array<{ title: string }>)
            .map(t => t.title);

          const status = THINGS_STATUS_MAP[row.status] ?? `unknown(${row.status})`;
          const itemType = THINGS_TYPE_MAP[row.type] ?? `unknown(${row.type})`;
          const title = row.title || 'Untitled Task';

          // Build content
          const contentParts = [title];
          if (row.notes) contentParts.push(row.notes);
          if (row.projectTitle) contentParts.push(`Project: ${row.projectTitle}`);
          if (tags.length > 0) contentParts.push(`Tags: ${tags.join(', ')}`);
          contentParts.push(`Status: ${status}`);

          // Timestamp: use modification date if available, else creation date
          let timestampMs: number;
          if (row.userModificationDate) {
            timestampMs = coreDataTimestampToMs(row.userModificationDate);
          } else if (row.creationDate) {
            timestampMs = coreDataTimestampToMs(row.creationDate);
          } else {
            timestampMs = Date.now();
          }

          items.push({
            id: deterministicId(row.uuid),
            sourceType: 'productivity',
            title,
            content: contentParts.join('\n'),
            timestamp: new Date(timestampMs).toISOString(),
            metadata: {
              uuid: row.uuid,
              status,
              item_type: itemType,
              start_date: thingsDateToISO(row.startDate),
              deadline: thingsDateToISO(row.deadline),
              project_title: row.projectTitle || null,
              project_uuid: row.projectUUID || null,
              tags,
              creation_date: row.creationDate ? new Date(coreDataTimestampToMs(row.creationDate)).toISOString() : null,
              source_app: 'things3',
            },
          });
        } catch (err) {
          errors.push({
            message: `Failed to parse Things task ${row.uuid}: ${(err as Error).message}`,
            raw: row.uuid,
          });
        }
      }

      return {
        format: 'things_sqlite',
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

/**
 * Zotero Reader — Reads research library from Zotero's SQLite database.
 *
 * Zotero stores its library in ~/Zotero/zotero.sqlite with a normalized schema:
 * - items: Base item records with type info
 * - itemData: Key-value pairs for item fields (linked by fieldID)
 * - itemDataValues: The actual field values
 * - fields: Field name lookup (fieldID -> fieldName)
 * - itemTypes: Item type lookup
 * - creators: Author/editor records
 * - itemCreators: Links items to creators
 * - collectionItems: Links items to collections
 * - collections: Collection metadata
 * - itemTags: Links items to tags
 * - tags: Tag name lookup
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { createHash } from 'node:crypto';
import type { ImportParser, ImportResult, ImportedItem, ParseOptions, ParseError } from '../types.js';

function deterministicId(itemKey: string): string {
  const hash = createHash('sha256').update(`zotero:${itemKey}`).digest('hex').slice(0, 12);
  return `zot_${hash}`;
}

export class ZoteroReader implements ImportParser {
  readonly sourceType = 'research' as const;
  readonly supportedFormats = ['zotero_sqlite'];

  canParse(path: string): boolean {
    const normalized = path.replace(/\\/g, '/').toLowerCase();
    return normalized.endsWith('zotero.sqlite') ||
           (normalized.includes('zotero') && normalized.endsWith('.sqlite'));
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
        format: 'zotero_sqlite',
        items: [],
        errors: [{ message: 'better-sqlite3 not available for Zotero parsing' }],
        totalFound: 0,
      };
    }

    // Copy to avoid locking the live database
    let dbPath = path;
    let copiedPath: string | null = null;
    try {
      const { copyFileSync, mkdtempSync } = await import('node:fs');
      const { join } = await import('node:path');
      const tmpDir = mkdtempSync(join(process.env.TEMP || '/tmp', 'zot-'));
      copiedPath = join(tmpDir, 'zotero_copy.sqlite');
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
        format: 'zotero_sqlite',
        items: [],
        errors: [{ message: `Failed to open database: ${(err as Error).message}` }],
        totalFound: 0,
      };
    }

    try {
      // Get total count of library items (excluding attachments and notes)
      const totalFound = (db.prepare(`
        SELECT COUNT(*) as cnt FROM items i
        JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
        WHERE it.typeName NOT IN ('attachment', 'note')
          AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
      `).get() as { cnt: number }).cnt;

      // Fetch items with their key and type
      let itemQuery = `
        SELECT i.itemID, i.key as itemKey, i.dateAdded, it.typeName as itemType
        FROM items i
        JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
        WHERE it.typeName NOT IN ('attachment', 'note')
          AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
      `;
      const params: unknown[] = [];

      if (options?.since) {
        itemQuery += ' AND i.dateAdded >= ?';
        params.push(options.since.toISOString().replace('T', ' ').replace('Z', ''));
      }

      itemQuery += ' ORDER BY i.dateAdded DESC';

      if (options?.limit) {
        itemQuery += ' LIMIT ?';
        params.push(options.limit);
      }

      const itemRows = db.prepare(itemQuery).all(...params) as Array<{
        itemID: number;
        itemKey: string;
        dateAdded: string;
        itemType: string;
      }>;

      // Prepare statements for metadata queries
      const getFieldData = db.prepare(`
        SELECT f.fieldName, idv.value
        FROM itemData id
        JOIN fields f ON id.fieldID = f.fieldID
        JOIN itemDataValues idv ON id.valueID = idv.valueID
        WHERE id.itemID = ?
      `);

      const getCreators = db.prepare(`
        SELECT c.firstName, c.lastName, ct.creatorType
        FROM itemCreators ic
        JOIN creators c ON ic.creatorID = c.creatorID
        JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
        WHERE ic.itemID = ?
        ORDER BY ic.orderIndex
      `);

      const getCollections = db.prepare(`
        SELECT col.collectionName
        FROM collectionItems ci
        JOIN collections col ON ci.collectionID = col.collectionID
        WHERE ci.itemID = ?
      `);

      const getTags = db.prepare(`
        SELECT t.name
        FROM itemTags itag
        JOIN tags t ON itag.tagID = t.tagID
        WHERE itag.itemID = ?
      `);

      const items: ImportedItem[] = [];

      for (const row of itemRows) {
        try {
          // Get all field data for this item
          const fieldRows = getFieldData.all(row.itemID) as Array<{ fieldName: string; value: string }>;
          const fields: Record<string, string> = {};
          for (const f of fieldRows) {
            fields[f.fieldName] = f.value;
          }

          // Get creators
          const creatorRows = getCreators.all(row.itemID) as Array<{
            firstName: string | null;
            lastName: string | null;
            creatorType: string;
          }>;
          const authors = creatorRows
            .filter(c => c.creatorType === 'author')
            .map(c => [c.firstName, c.lastName].filter(Boolean).join(' '));
          const allCreators = creatorRows
            .map(c => ({
              name: [c.firstName, c.lastName].filter(Boolean).join(' '),
              type: c.creatorType,
            }));

          // Get collections
          const collectionRows = getCollections.all(row.itemID) as Array<{ collectionName: string }>;
          const collections = collectionRows.map(c => c.collectionName);

          // Get tags
          const tagRows = getTags.all(row.itemID) as Array<{ name: string }>;
          const tags = tagRows.map(t => t.name);

          const title = fields['title'] || `Untitled ${row.itemType}`;
          const abstract = fields['abstractNote'] || '';
          const date = fields['date'] || row.dateAdded;
          const doi = fields['DOI'] || null;
          const url = fields['url'] || null;
          const publicationTitle = fields['publicationTitle'] || null;
          const volume = fields['volume'] || null;
          const issue = fields['issue'] || null;
          const pages = fields['pages'] || null;

          // Build content string for indexing
          const contentParts = [title];
          if (authors.length > 0) contentParts.push(`Authors: ${authors.join(', ')}`);
          if (abstract) contentParts.push(abstract);
          if (doi) contentParts.push(`DOI: ${doi}`);
          if (tags.length > 0) contentParts.push(`Tags: ${tags.join(', ')}`);
          if (collections.length > 0) contentParts.push(`Collections: ${collections.join(', ')}`);

          // Parse dateAdded for timestamp
          let timestamp: string;
          try {
            timestamp = new Date(row.dateAdded).toISOString();
          } catch {
            timestamp = new Date().toISOString();
          }

          items.push({
            id: deterministicId(row.itemKey),
            sourceType: 'research',
            title,
            content: contentParts.join('\n'),
            timestamp,
            metadata: {
              item_type: row.itemType,
              item_key: row.itemKey,
              authors,
              all_creators: allCreators,
              abstract,
              date,
              doi,
              url,
              publication_title: publicationTitle,
              volume,
              issue,
              pages,
              tags,
              collections,
              source_app: 'zotero',
            },
          });
        } catch (err) {
          errors.push({
            message: `Failed to parse Zotero item ${row.itemKey}: ${(err as Error).message}`,
            raw: row.itemKey,
          });
        }
      }

      return {
        format: 'zotero_sqlite',
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

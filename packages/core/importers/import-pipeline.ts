/**
 * Import Pipeline — Orchestrates parsing, deduplication, indexing, and history tracking.
 *
 * Flow: Premium check -> parser.canParse -> parser.parse -> dedup against imported_items
 *       -> feed Indexer.indexDocument() -> record in import_history
 *       -> if items > 50, fire Knowledge Moment
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import { nanoid } from 'nanoid';
import type { DatabaseHandle } from '../platform/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { Indexer } from '../knowledge/indexer.js';
import type { KnowledgeMomentGenerator } from '../agent/knowledge-moment.js';
import type { DocumentSource } from '../knowledge/types.js';
import type { ImportParser, ImportSourceType, ImportedItem, ParseOptions, ParseError } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportSummary {
  importId: string;
  sourceType: ImportSourceType;
  format: string;
  totalFound: number;
  imported: number;
  skippedDuplicates: number;
  errors: ParseError[];
  durationMs: number;
  knowledgeMomentFired: boolean;
}

interface ImportHistoryRow {
  id: string;
  source_type: string;
  format: string;
  imported_at: string;
  item_count: number;
  errors: string;
  status: string;
  metadata_json: string;
}

// ─── Source Type Mapping ────────────────────────────────────────────────────

const SOURCE_TYPE_TO_DOCUMENT_SOURCE: Record<ImportSourceType, DocumentSource> = {
  browser_history: 'browser_history',
  notes: 'note',
  photos_metadata: 'photos_metadata',
  messaging: 'messaging',
};

// ─── SQL Schema ─────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS import_history (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    format TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    item_count INTEGER NOT NULL,
    errors TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'complete',
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS imported_items (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    format TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    import_id TEXT NOT NULL,
    embedding_id TEXT,
    entity_id TEXT,
    FOREIGN KEY (import_id) REFERENCES import_history(id)
  );

  CREATE INDEX IF NOT EXISTS idx_imported_items_source ON imported_items(source_type);
  CREATE INDEX IF NOT EXISTS idx_imported_items_import ON imported_items(import_id);
`;

// ─── Import Pipeline ────────────────────────────────────────────────────────

export class ImportPipeline {
  private db: DatabaseHandle;
  private indexer: Indexer;
  private premiumGate: PremiumGate;
  private knowledgeMomentGenerator: KnowledgeMomentGenerator | null;
  private parsers: Map<ImportSourceType, ImportParser[]> = new Map();

  constructor(config: {
    db: DatabaseHandle;
    indexer: Indexer;
    premiumGate: PremiumGate;
    knowledgeMomentGenerator?: KnowledgeMomentGenerator;
  }) {
    this.db = config.db;
    this.indexer = config.indexer;
    this.premiumGate = config.premiumGate;
    this.knowledgeMomentGenerator = config.knowledgeMomentGenerator ?? null;
  }

  /**
   * Initialize the SQLite schema for import tracking.
   */
  initSchema(): void {
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Register a parser for a specific source type.
   */
  registerParser(parser: ImportParser): void {
    const existing = this.parsers.get(parser.sourceType) ?? [];
    existing.push(parser);
    this.parsers.set(parser.sourceType, existing);
  }

  /**
   * Get all available import sources with their parsers.
   */
  getAvailableSources(): Array<{ sourceType: ImportSourceType; formats: string[] }> {
    const sources: Array<{ sourceType: ImportSourceType; formats: string[] }> = [];
    for (const [sourceType, parsers] of this.parsers) {
      const formats = parsers.flatMap(p => p.supportedFormats);
      sources.push({ sourceType, formats });
    }
    return sources;
  }

  /**
   * Run an import from the given source path.
   */
  async runImport(
    sourcePath: string,
    sourceType: ImportSourceType,
    options?: ParseOptions,
  ): Promise<ImportSummary> {
    const startMs = Date.now();
    const importId = nanoid();

    // Premium check
    if (!this.premiumGate.isFeatureAvailable('import-digital-life')) {
      return {
        importId,
        sourceType,
        format: 'unknown',
        totalFound: 0,
        imported: 0,
        skippedDuplicates: 0,
        errors: [{ message: 'Import Digital Life requires Digital Representative tier' }],
        durationMs: Date.now() - startMs,
        knowledgeMomentFired: false,
      };
    }

    // Find a matching parser
    const parsers = this.parsers.get(sourceType) ?? [];
    const parser = parsers.find(p => p.canParse(sourcePath));

    if (!parser) {
      return {
        importId,
        sourceType,
        format: 'unknown',
        totalFound: 0,
        imported: 0,
        skippedDuplicates: 0,
        errors: [{ message: `No parser found for ${sourceType} at path: ${sourcePath}` }],
        durationMs: Date.now() - startMs,
        knowledgeMomentFired: false,
      };
    }

    // Parse
    const parseResult = await parser.parse(sourcePath, options);

    // Dedup and index
    let imported = 0;
    let skippedDuplicates = 0;
    const documentSource = SOURCE_TYPE_TO_DOCUMENT_SOURCE[sourceType];

    // Record import history first
    this.db.prepare(`
      INSERT INTO import_history (id, source_type, format, imported_at, item_count, errors, status, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      importId,
      sourceType,
      parseResult.format,
      new Date().toISOString(),
      0, // Will update after
      JSON.stringify(parseResult.errors),
      'in_progress',
      JSON.stringify({ sourcePath }),
    );

    for (const item of parseResult.items) {
      // Check if already imported (by source item ID)
      const existing = this.db.prepare(
        'SELECT id FROM imported_items WHERE id = ?'
      ).get(item.id) as { id: string } | undefined;

      if (existing) {
        skippedDuplicates++;
        continue;
      }

      // Index via the Indexer
      const indexResult = await this.indexer.indexDocument({
        content: item.content,
        title: item.title,
        source: documentSource,
        sourcePath: `import:${sourceType}:${item.id}`,
        mimeType: 'text/plain',
        metadata: { ...item.metadata, importId, importSourceType: sourceType },
      });

      // Record in imported_items
      this.db.prepare(`
        INSERT INTO imported_items (id, source_type, format, title, content, timestamp, metadata_json, import_id, embedding_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id,
        item.sourceType,
        parseResult.format,
        item.title,
        item.content,
        item.timestamp,
        JSON.stringify(item.metadata),
        importId,
        indexResult.documentId,
      );

      imported++;
    }

    // Update import history with final count
    this.db.prepare(`
      UPDATE import_history SET item_count = ?, status = ? WHERE id = ?
    `).run(imported, 'complete', importId);

    // Fire Knowledge Moment if > 50 items imported
    let knowledgeMomentFired = false;
    if (imported > 50 && this.knowledgeMomentGenerator) {
      try {
        await this.knowledgeMomentGenerator.generate();
        knowledgeMomentFired = true;
      } catch {
        // Non-fatal: Knowledge Moment is nice-to-have
      }
    }

    return {
      importId,
      sourceType,
      format: parseResult.format,
      totalFound: parseResult.totalFound,
      imported,
      skippedDuplicates,
      errors: parseResult.errors,
      durationMs: Date.now() - startMs,
      knowledgeMomentFired,
    };
  }

  /**
   * Get import history records.
   */
  getImportHistory(): Array<{
    id: string;
    sourceType: ImportSourceType;
    format: string;
    importedAt: string;
    itemCount: number;
    status: string;
  }> {
    const rows = this.db.prepare(
      'SELECT * FROM import_history ORDER BY imported_at DESC'
    ).all() as ImportHistoryRow[];

    return rows.map(r => ({
      id: r.id,
      sourceType: r.source_type as ImportSourceType,
      format: r.format,
      importedAt: r.imported_at,
      itemCount: r.item_count,
      status: r.status,
    }));
  }
}

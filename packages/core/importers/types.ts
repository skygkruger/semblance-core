/**
 * Import Pipeline Types — Unified interface for importing external data sources.
 *
 * Each parser handles a specific format (Chrome JSON, Firefox SQLite, Obsidian MD, etc.)
 * and converts it into ImportedItem[] for the pipeline to feed into the Indexer.
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

export type ImportSourceType = 'browser_history' | 'notes' | 'photos_metadata' | 'messaging';

export interface ImportParser<T = ImportedItem> {
  /** Source type this parser handles */
  readonly sourceType: ImportSourceType;
  /** Supported format identifiers (e.g. 'chrome_json', 'firefox_sqlite') */
  readonly supportedFormats: string[];
  /** Check if the parser can handle the given path/data */
  canParse(path: string, data?: string): boolean;
  /** Parse the source and return imported items */
  parse(path: string, options?: ParseOptions): Promise<ImportResult<T>>;
}

export interface ParseOptions {
  /** Only import items after this date */
  since?: Date;
  /** Maximum number of items to import */
  limit?: number;
  /** Additional parser-specific options */
  extra?: Record<string, unknown>;
}

export interface ImportResult<T = ImportedItem> {
  /** Format identifier (e.g. 'chrome_json') */
  format: string;
  /** Parsed items */
  items: T[];
  /** Errors encountered during parsing (non-fatal) */
  errors: ParseError[];
  /** Total items found before filtering */
  totalFound: number;
}

export interface ImportedItem {
  /** Deterministic ID based on source content (e.g. 'chr_abc123') */
  id: string;
  /** Source type */
  sourceType: ImportSourceType;
  /** Title or label for the item */
  title: string;
  /** Text content for indexing */
  content: string;
  /** ISO 8601 timestamp of the original item */
  timestamp: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

export interface ParseError {
  /** Description of the error */
  message: string;
  /** Line number or item index where the error occurred */
  index?: number;
  /** The raw data that caused the error */
  raw?: string;
}

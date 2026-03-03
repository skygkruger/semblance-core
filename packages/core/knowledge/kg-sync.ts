// Knowledge Graph Delta Sync — Export/import document metadata for cross-device sync.
//
// Only metadata is synced (title, source, contentHash, mimeType, timestamps).
// Embeddings and vector data are NOT synced — each device builds its own.
// The receiving device uses the metadata to decide whether to re-index content
// that exists locally (e.g., shared email, shared file paths).
//
// Payload cap: 10 MB. If the delta exceeds this, it is truncated oldest-first.

import type { Document, DocumentSource } from './types.js';

/** Maximum sync payload size in bytes (10 MB) */
export const KG_SYNC_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A single document's sync-safe metadata (no content, no embeddings).
 */
export interface KGSyncEntry {
  id: string;
  source: DocumentSource;
  sourcePath?: string;
  title: string;
  contentHash: string;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  indexedAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Delta payload for knowledge graph sync.
 */
export interface KGSyncDelta {
  /** Documents added or updated since last sync */
  upserts: KGSyncEntry[];
  /** Document IDs deleted since last sync */
  deletions: string[];
  /** Timestamp of this delta generation */
  generatedAt: string;
  /** Whether the delta was truncated due to size cap */
  truncated: boolean;
}

/**
 * Result of importing a knowledge graph delta.
 */
export interface KGSyncImportResult {
  /** New documents accepted (metadata stored, pending local re-index) */
  newDocuments: number;
  /** Documents skipped because they already exist locally (same contentHash) */
  duplicates: number;
  /** Documents deleted locally based on remote deletions */
  deleted: number;
}

/**
 * Extract sync-safe metadata from a Document.
 */
export function documentToSyncEntry(doc: Document): KGSyncEntry {
  return {
    id: doc.id,
    source: doc.source,
    sourcePath: doc.sourcePath,
    title: doc.title,
    contentHash: doc.contentHash,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    indexedAt: doc.indexedAt,
    metadata: doc.metadata,
  };
}

/**
 * Build a knowledge graph sync delta from document list.
 * Filters to only documents changed since `since` timestamp.
 * Enforces 10 MB payload cap by truncating oldest entries first.
 */
export function buildKGDelta(
  documents: Document[],
  deletedIds: string[],
  since: string | null,
): KGSyncDelta {
  // Filter to changed documents
  let filtered: Document[];
  if (since) {
    filtered = documents.filter(d => d.updatedAt > since || d.indexedAt > since);
  } else {
    filtered = [...documents];
  }

  // Sort newest-first so truncation drops oldest
  filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const entries: KGSyncEntry[] = [];
  let truncated = false;

  for (const doc of filtered) {
    const entry = documentToSyncEntry(doc);
    entries.push(entry);

    // Check approximate size (conservative estimate)
    const approxSize = JSON.stringify({ upserts: entries, deletions: deletedIds }).length;
    if (approxSize > KG_SYNC_MAX_BYTES) {
      entries.pop(); // Remove the one that pushed us over
      truncated = true;
      break;
    }
  }

  return {
    upserts: entries,
    deletions: deletedIds,
    generatedAt: new Date().toISOString(),
    truncated,
  };
}

/**
 * Apply a knowledge graph delta to local storage.
 * Returns import statistics.
 *
 * `localHashes` is a Set of contentHash values already in the local store.
 * `onNewDocument` is called for each new document to store its metadata.
 * `onDelete` is called for each document ID to delete.
 */
export function applyKGDelta(
  delta: KGSyncDelta,
  localHashes: Set<string>,
  onNewDocument: (entry: KGSyncEntry) => void,
  onDelete: (id: string) => void,
): KGSyncImportResult {
  let newDocuments = 0;
  let duplicates = 0;
  let deleted = 0;

  for (const entry of delta.upserts) {
    if (localHashes.has(entry.contentHash)) {
      duplicates++;
    } else {
      onNewDocument(entry);
      localHashes.add(entry.contentHash);
      newDocuments++;
    }
  }

  for (const id of delta.deletions) {
    onDelete(id);
    deleted++;
  }

  return { newDocuments, duplicates, deleted };
}

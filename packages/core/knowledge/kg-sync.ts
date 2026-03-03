// Knowledge Graph Delta Sync — Export/import documents with content for cross-device sync.
//
// Syncs full document content + chunk text so the receiving device can build
// its own local embeddings and search index. Embeddings and vector data are
// NOT synced — each device rebuilds them from content for its local model.
//
// Payload cap: 10 MB. If the delta exceeds this, it is truncated oldest-first.

import type { Document, DocumentChunk, DocumentSource } from './types.js';

/** Maximum sync payload size in bytes (10 MB) */
export const KG_SYNC_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A single document's sync payload (full content, no embeddings).
 * Content is included so the receiving device can build its own embeddings.
 * Embeddings are excluded — each device generates them for its local model.
 */
export interface KGSyncEntry {
  id: string;
  source: DocumentSource;
  sourcePath?: string;
  title: string;
  content: string;
  contentHash: string;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  indexedAt: string;
  metadata: Record<string, unknown>;
  /** Pre-split chunks (text only, no embeddings). Receiving device re-embeds. */
  chunks: Array<{ id: string; content: string; chunkIndex: number; metadata: Record<string, unknown> }>;
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
  /** New documents accepted (content stored, pending local embedding) */
  newDocuments: number;
  /** Documents skipped because they already exist locally (same contentHash) */
  duplicates: number;
  /** Documents deleted locally based on remote deletions */
  deleted: number;
}

/**
 * Build a sync entry from a Document and its chunks.
 * Includes full text content so the receiving device can re-embed.
 * Strips embedding vectors — each device generates its own.
 */
export function documentToSyncEntry(doc: Document, chunks: DocumentChunk[] = []): KGSyncEntry {
  return {
    id: doc.id,
    source: doc.source,
    sourcePath: doc.sourcePath,
    title: doc.title,
    content: doc.content,
    contentHash: doc.contentHash,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    indexedAt: doc.indexedAt,
    metadata: doc.metadata,
    chunks: chunks.map(c => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
      metadata: c.metadata,
    })),
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

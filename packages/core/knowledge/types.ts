// Knowledge Graph Types — All personal data indexed, embedded, searchable locally.
// No data leaves the device. Ever.

export interface Document {
  id: string;                 // nanoid
  source: DocumentSource;
  sourcePath?: string;        // File path, email ID, etc.
  title: string;
  content: string;            // Full text content
  contentHash: string;        // SHA-256 of content (dedup)
  mimeType: string;
  createdAt: string;          // ISO 8601
  updatedAt: string;
  indexedAt: string;          // When we indexed it
  metadata: Record<string, unknown>;
}

export type DocumentSource =
  | 'local_file'
  | 'email'
  | 'calendar'
  | 'contact'
  | 'note'
  | 'financial'
  | 'health'
  | 'browser_history'
  | 'cloud_storage'
  | 'photos_metadata'
  | 'messaging'
  | 'manual';

export interface DocumentChunk {
  id: string;
  documentId: string;         // Parent document
  content: string;            // Chunk text
  chunkIndex: number;         // Position within document
  embedding?: number[];       // Vector embedding (stored in LanceDB)
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  chunk: DocumentChunk;
  document: Document;
  score: number;              // Similarity score (0–1)
  highlights?: string[];      // Matching passages for display
}

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];          // Alternative names/spellings
  firstSeen: string;          // ISO 8601
  lastSeen: string;
  metadata: Record<string, unknown>;
}

export type EntityType =
  | 'person'
  | 'organization'
  | 'location'
  | 'project'
  | 'event'
  | 'topic';

export interface EntityMention {
  entityId: string;
  documentId: string;
  chunkId: string;
  context: string;            // Surrounding text
  mentionedAt: string;
}

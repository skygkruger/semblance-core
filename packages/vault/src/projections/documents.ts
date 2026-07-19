import { z } from 'zod';
import type { DecryptedVaultEvent } from '../agency-graph/types.js';

export const DocumentProjectionPayloadV1 = z
  .object({
    schemaVersion: z.literal(1),
    documentId: z.string().min(1),
    title: z.string().min(1),
    mimeType: z.string().optional(),
    sourcePath: z.string().optional(),
    pathHash: z.string().optional(),
    contentHash: z.string().optional(),
    lastModified: z.string().optional(),
    extension: z.string().optional(),
    byteLength: z.number().int().nonnegative().optional(),
    relatedPersonIds: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type DocumentProjectionPayloadV1 = z.infer<typeof DocumentProjectionPayloadV1>;

export interface DocumentProjectionRecord {
  documentId: string;
  title: string;
  mimeType: string | null;
  sourcePath: string | null;
  byteLength: number | null;
  relatedPersonIds: string[];
  sourceEventId: string;
  occurredAt: string;
  sourceRefs: DecryptedVaultEvent['sourceRefs'];
}

export interface DocumentProjectionSnapshot {
  documents: DocumentProjectionRecord[];
  documentCount: number;
}

function parsePayload(event: DecryptedVaultEvent): DocumentProjectionPayloadV1 | null {
  if (event.eventType !== 'source_ingested') {
    return null;
  }

  const parsed = DocumentProjectionPayloadV1.safeParse(event.payload);
  return parsed.success ? parsed.data : null;
}

function collectDeletedDocumentIds(events: DecryptedVaultEvent[]): Set<string> {
  const deleted = new Set<string>();
  for (const event of events) {
    if (event.eventType !== 'deleted') {
      continue;
    }
    const payload = event.payload as { entityType?: string; entityId?: string } | null;
    if (payload?.entityType === 'document' && payload.entityId) {
      deleted.add(payload.entityId);
    }
  }
  return deleted;
}

export function projectDocumentsFromEvents(
  events: DecryptedVaultEvent[],
): DocumentProjectionSnapshot {
  const documents: DocumentProjectionRecord[] = [];
  const seen = new Set<string>();
  const deletedDocumentIds = collectDeletedDocumentIds(events);

  const ordered = [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  for (const event of ordered) {
    const payload = parsePayload(event);
    if (!payload) {
      continue;
    }

    if (deletedDocumentIds.has(payload.documentId)) {
      continue;
    }

    if (seen.has(payload.documentId)) {
      continue;
    }
    seen.add(payload.documentId);

    documents.push({
      documentId: payload.documentId,
      title: payload.title,
      mimeType: payload.mimeType ?? null,
      sourcePath: payload.sourcePath ?? null,
      byteLength: payload.byteLength ?? null,
      relatedPersonIds: payload.relatedPersonIds ?? [],
      sourceEventId: event.eventId,
      occurredAt: event.occurredAt,
      sourceRefs: event.sourceRefs,
    });
  }

  documents.sort((a, b) => a.documentId.localeCompare(b.documentId));

  return {
    documents,
    documentCount: documents.length,
  };
}

export function searchDocumentsByQuery(
  events: DecryptedVaultEvent[],
  query: string,
): DocumentProjectionRecord[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }

  const snapshot = projectDocumentsFromEvents(events);
  return snapshot.documents.filter((document) => {
    const haystack = `${document.title} ${document.documentId}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

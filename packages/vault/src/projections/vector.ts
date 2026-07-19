import { z } from 'zod';
import type { DecryptedVaultEvent } from '../agency-graph/types.js';
import { DocumentProjectionPayloadV1 } from './documents.js';

export const VectorChunkProjectionPayloadV1 = z
  .object({
    schemaVersion: z.literal(1),
    documentId: z.string().min(1),
    chunkIndex: z.number().int().nonnegative(),
    contentHash: z.string().min(1),
    tokenCount: z.number().int().nonnegative().optional(),
  })
  .strict();
export type VectorChunkProjectionPayloadV1 = z.infer<typeof VectorChunkProjectionPayloadV1>;

export interface VectorProjectionRecord {
  documentId: string;
  chunkIndex: number;
  contentHash: string;
  tokenCount: number | null;
  sourceEventId: string;
  occurredAt: string;
}

export interface VectorProjectionSnapshot {
  chunks: VectorProjectionRecord[];
  chunkCount: number;
}

function parseDocumentPayload(event: DecryptedVaultEvent): z.infer<typeof DocumentProjectionPayloadV1> | null {
  if (event.eventType !== 'source_ingested') {
    return null;
  }
  const parsed = DocumentProjectionPayloadV1.safeParse(event.payload);
  return parsed.success ? parsed.data : null;
}

function parseVectorPayload(event: DecryptedVaultEvent): VectorChunkProjectionPayloadV1 | null {
  if (event.eventType !== 'source_ingested') {
    return null;
  }

  const parsed = VectorChunkProjectionPayloadV1.safeParse(event.payload);
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

export function projectVectorsFromEvents(events: DecryptedVaultEvent[]): VectorProjectionSnapshot {
  const chunks: VectorProjectionRecord[] = [];
  const seen = new Set<string>();
  const deletedDocumentIds = collectDeletedDocumentIds(events);

  const ordered = [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  for (const event of ordered) {
    const vectorPayload = parseVectorPayload(event);
    if (vectorPayload) {
      if (deletedDocumentIds.has(vectorPayload.documentId)) {
        continue;
      }
      const key = `${vectorPayload.documentId}:${vectorPayload.chunkIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        chunks.push({
          documentId: vectorPayload.documentId,
          chunkIndex: vectorPayload.chunkIndex,
          contentHash: vectorPayload.contentHash,
          tokenCount: vectorPayload.tokenCount ?? null,
          sourceEventId: event.eventId,
          occurredAt: event.occurredAt,
        });
      }
      continue;
    }

    const documentPayload = parseDocumentPayload(event);
    if (documentPayload) {
      if (deletedDocumentIds.has(documentPayload.documentId)) {
        continue;
      }
      const key = `${documentPayload.documentId}:0`;
      if (!seen.has(key)) {
        seen.add(key);
        const contentHash = `doc:${documentPayload.documentId}:${documentPayload.title}`;
        chunks.push({
          documentId: documentPayload.documentId,
          chunkIndex: 0,
          contentHash,
          tokenCount: null,
          sourceEventId: event.eventId,
          occurredAt: event.occurredAt,
        });
      }
    }
  }

  chunks.sort((a, b) => {
    const docCompare = a.documentId.localeCompare(b.documentId);
    if (docCompare !== 0) {
      return docCompare;
    }
    return a.chunkIndex - b.chunkIndex;
  });

  return {
    chunks,
    chunkCount: chunks.length,
  };
}

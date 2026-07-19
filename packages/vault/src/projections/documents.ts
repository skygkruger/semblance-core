import { z } from 'zod';
import type { DecryptedVaultEvent } from '../agency-graph/types.js';

export const DocumentProjectionPayloadV1 = z
  .object({
    schemaVersion: z.literal(1),
    documentId: z.string().min(1),
    title: z.string().min(1),
    mimeType: z.string().optional(),
    sourcePath: z.string().optional(),
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

export function projectDocumentsFromEvents(
  events: DecryptedVaultEvent[],
): DocumentProjectionSnapshot {
  const documents: DocumentProjectionRecord[] = [];
  const seen = new Set<string>();

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

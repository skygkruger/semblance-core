import type { CapabilityGrantV1 } from '@semblance/protocol';
import type { DecryptedVaultEvent } from '../agency-graph/types.js';
import { createVaultCapabilityClient } from '../capabilities/client.js';
import { readDecryptedEvents } from '../deletion/eraser.js';
import type { VaultEventLog } from '../event-log/index.js';
import { DocumentProjectionPayloadV1 } from '../projections/documents.js';
import { createQueryLimitedVaultReadGrant } from './grant-factory.js';

/** Matches @semblance/core VaultChatGrounding — kept local to avoid vault→core dependency. */
export interface VaultChatChunk {
  sourceId: string;
  title: string;
  text: string;
}

export interface VaultChatGrounding {
  retrieve(query: string, limit: number): Promise<{ chunks: VaultChatChunk[]; grantId: string }>;
  validateCitations(
    grantId: string,
    citedSourceIds: string[],
  ): { ok: true } | { ok: false; rejected: string[] };
}

export interface VaultChatGroundingOptions {
  eventLog: VaultEventLog;
  principalId: string;
  deviceId: string;
  clock?: () => number;
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

function searchAuthorizedDocumentChunks(
  events: DecryptedVaultEvent[],
  query: string,
  limit: number,
): VaultChatChunk[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return [];
  }

  const deletedDocumentIds = collectDeletedDocumentIds(events);
  const chunks: VaultChatChunk[] = [];
  const seenSourceIds = new Set<string>();

  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);

  for (const event of ordered) {
    if (event.eventType !== 'source_ingested') {
      continue;
    }

    const parsed = DocumentProjectionPayloadV1.safeParse(event.payload);
    if (!parsed.success) {
      continue;
    }

    const payload = parsed.data;
    if (deletedDocumentIds.has(payload.documentId)) {
      continue;
    }

    const haystack = `${payload.title} ${payload.documentId}`.toLowerCase();
    if (!haystack.includes(normalizedQuery)) {
      continue;
    }

    const sourceId = event.sourceRefs[0]?.sourceId ?? `doc:${payload.documentId}`;
    if (seenSourceIds.has(sourceId)) {
      continue;
    }
    seenSourceIds.add(sourceId);

    chunks.push({
      sourceId,
      title: payload.title,
      text: payload.title,
    });

    if (chunks.length >= limit) {
      break;
    }
  }

  return chunks;
}

/**
 * Capability-guarded vault chat retrieval with per-request grant tracking for citation validation.
 */
export class VaultChatGroundingImpl implements VaultChatGrounding {
  private readonly eventLog: VaultEventLog;
  private readonly principalId: string;
  private readonly deviceId: string;
  private readonly clock: () => number;
  private readonly grantSourceIds = new Map<string, Set<string>>();

  constructor(options: VaultChatGroundingOptions) {
    this.eventLog = options.eventLog;
    this.principalId = options.principalId;
    this.deviceId = options.deviceId;
    this.clock = options.clock ?? (() => Date.now());
  }

  async retrieve(query: string, limit: number): Promise<{ chunks: VaultChatChunk[]; grantId: string }> {
    const grant = createQueryLimitedVaultReadGrant({
      principalId: this.principalId,
      deviceId: this.deviceId,
      query,
      limit,
      clock: this.clock,
    });

    const chunks = this.retrieveWithGrant(grant, query, limit);
    this.grantSourceIds.set(
      grant.capabilityId,
      new Set(chunks.map((chunk) => chunk.sourceId)),
    );

    return { chunks, grantId: grant.capabilityId };
  }

  validateCitations(
    grantId: string,
    citedSourceIds: string[],
  ): { ok: true } | { ok: false; rejected: string[] } {
    const authorized = this.grantSourceIds.get(grantId);
    if (!authorized) {
      return { ok: false, rejected: [...citedSourceIds] };
    }

    const rejected = citedSourceIds.filter((sourceId) => !authorized.has(sourceId));
    if (rejected.length > 0) {
      return { ok: false, rejected };
    }
    return { ok: true };
  }

  /** @internal Exposed for tests that need grant-scoped retrieval. */
  retrieveWithGrant(
    grant: CapabilityGrantV1,
    query: string,
    limit: number,
  ): VaultChatChunk[] {
    const client = createVaultCapabilityClient({ grant, clock: this.clock });
    const nowMs = this.clock();

    client.authorizeRead({
      kind: 'document_search',
      text: query,
      limit,
    });

    const events = readDecryptedEvents({
      reader: this.eventLog.reader,
      grant,
      principalId: this.principalId,
      nowMs,
    });

    return searchAuthorizedDocumentChunks(events, query, limit);
  }
}

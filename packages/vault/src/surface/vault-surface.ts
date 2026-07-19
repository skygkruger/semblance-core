import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { hostname } from 'node:os';
import type { DecryptedVaultEvent } from '../agency-graph/types.js';
import {
  createVaultContentEraser,
  readDecryptedEvents,
  type VaultDeletionResult,
} from '../deletion/eraser.js';
import type { VaultEventLog } from '../event-log/index.js';
import { parseAssertion, parseProvenanceRecord } from '../provenance/index.js';
import { projectDocumentsFromEvents } from '../projections/documents.js';
import { createSourceRef, parseSourceRefs } from '../provenance/source-ref.js';
import { createVaultSurfaceReadGrant } from './grant-factory.js';

const LOCAL_PRINCIPAL_ID = 'principal-local-vault-surface';

export interface VaultSourceSummary {
  sourceId: string;
  sourceType: string;
  documentId: string;
  title: string;
  mimeType: string | null;
  ingestedAt: string;
  pathHash: string | null;
  deleted: boolean;
  retentionUntil: string | null;
}

export interface VaultAssertionSummary {
  assertionId: string;
  status: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  derivationMethod: string;
  sourceIds: string[];
  retentionUntil: string | null;
  createdAt: string;
  corrected: boolean;
}

export interface VaultSurfaceStatus {
  sourceCount: number;
  assertionCount: number;
  eventCount: number;
  hasVaultEvents: boolean;
}

export interface VaultSurfaceExport {
  exportedAt: string;
  sources: VaultSourceSummary[];
  assertions: VaultAssertionSummary[];
}

export interface VaultSurfaceOpsOptions {
  eventLog: VaultEventLog;
  db: Database.Database;
  rootKey: Buffer;
  deviceId?: string;
  principalId?: string;
  clock?: () => number;
}

export interface VaultSurfaceOps {
  listSources(): VaultSourceSummary[];
  listAssertions(): VaultAssertionSummary[];
  getStatus(): VaultSurfaceStatus;
  exportSnapshot(): VaultSurfaceExport;
  deleteSource(sourceId: string): VaultDeletionResult;
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

export function projectVaultSources(events: DecryptedVaultEvent[]): VaultSourceSummary[] {
  const deletedDocumentIds = collectDeletedDocumentIds(events);
  const snapshot = projectDocumentsFromEvents(events);
  const sources: VaultSourceSummary[] = [];

  for (const doc of snapshot.documents) {
    const sourceRef = doc.sourceRefs[0];
    const sourceId = sourceRef?.sourceId ?? `document:${doc.documentId}`;
    const sourceType = sourceRef?.sourceType ?? 'file';

    sources.push({
      sourceId,
      sourceType,
      documentId: doc.documentId,
      title: doc.title,
      mimeType: doc.mimeType,
      ingestedAt: doc.occurredAt,
      pathHash: null,
      deleted: deletedDocumentIds.has(doc.documentId),
      retentionUntil: null,
    });
  }

  return sources.sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
}

export function projectVaultAssertions(events: DecryptedVaultEvent[]): VaultAssertionSummary[] {
  const byId = new Map<string, VaultAssertionSummary>();

  for (const event of events) {
    if (
      event.eventType !== 'assertion_confirmed'
      && event.eventType !== 'assertion_proposed'
      && event.eventType !== 'assertion_corrected'
    ) {
      continue;
    }

    const payload = event.payload as { assertion?: unknown } | null;
    if (!payload?.assertion) {
      continue;
    }

    try {
      const assertion = parseAssertion(payload.assertion);
      const provenance = parseProvenanceRecord(assertion.provenance);
      const sourceIds = provenance.sourceRefs.map((ref) => ref.sourceId);

      byId.set(assertion.assertionId, {
        assertionId: assertion.assertionId,
        status: assertion.status,
        subject: assertion.subject,
        predicate: assertion.predicate,
        object: assertion.object,
        confidence: provenance.confidence,
        derivationMethod: provenance.derivationMethod,
        sourceIds,
        retentionUntil: provenance.retention.retainUntil,
        createdAt: assertion.createdAt,
        corrected: assertion.status === 'corrected' || provenance.derivationMethod === 'corrected',
      });
    } catch {
      // Skip malformed assertion payloads
    }
  }

  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findDocumentIdForSourceId(
  events: DecryptedVaultEvent[],
  sourceId: string,
): { documentId: string; sourceEventId: string } | null {
  for (const event of events) {
    if (event.eventType !== 'source_ingested') {
      continue;
    }

    const refs = parseSourceRefs(event.sourceRefs);
    if (!refs.some((ref) => ref.sourceId === sourceId)) {
      continue;
    }

    const payload = event.payload as { documentId?: string } | null;
    if (payload?.documentId) {
      return { documentId: payload.documentId, sourceEventId: event.eventId };
    }
  }

  return null;
}

export function createVaultSurfaceOps(options: VaultSurfaceOpsOptions): VaultSurfaceOps {
  const deviceId = options.deviceId ?? hostname();
  const principalId = options.principalId ?? LOCAL_PRINCIPAL_ID;
  const clock = options.clock ?? (() => Date.now());

  const readEvents = (): DecryptedVaultEvent[] => {
    const grant = createVaultSurfaceReadGrant({
      principalId,
      deviceId,
      clock,
    });

    return readDecryptedEvents({
      reader: options.eventLog.reader,
      grant,
      principalId,
      nowMs: clock(),
    });
  };

  const eraser = createVaultContentEraser({
    db: options.db,
    rootKey: options.rootKey,
    writer: options.eventLog.writer,
    reader: options.eventLog.reader,
  });

  return {
    listSources() {
      return projectVaultSources(readEvents());
    },

    listAssertions() {
      return projectVaultAssertions(readEvents());
    },

    getStatus() {
      const events = readEvents();
      const sources = projectVaultSources(events);
      const assertions = projectVaultAssertions(events);
      return {
        sourceCount: sources.filter((source) => !source.deleted).length,
        assertionCount: assertions.length,
        eventCount: events.length,
        hasVaultEvents: events.length > 0,
      };
    },

    exportSnapshot() {
      const sources = this.listSources();
      const assertions = this.listAssertions();
      return {
        exportedAt: new Date(clock()).toISOString(),
        sources,
        assertions,
      };
    },

    deleteSource(sourceId: string) {
      const events = readEvents();
      const match = findDocumentIdForSourceId(events, sourceId);
      if (!match) {
        throw new Error(`Vault source not found: ${sourceId}`);
      }

      const grant = createVaultSurfaceReadGrant({
        principalId,
        deviceId,
        clock,
      });

      const sourceRef = createSourceRef({
        sourceId,
        sourceType: 'file',
        uri: `vault://source/${sourceId}`,
        ingestedAt: new Date(clock()).toISOString(),
      });

      return eraser.deleteContent(
        {
          entityId: match.documentId,
          entityType: 'document',
          dataDomain: 'documents',
          tombstoneEventId: `vault-delete-${randomUUID()}`,
          deviceId,
          membershipEpoch: 1,
          policyEpoch: 1,
          sourceRefs: [sourceRef],
          sensitivity: 'personal',
          occurredAt: new Date(clock()).toISOString(),
          sourceEventId: match.sourceEventId,
          authorizedDevices: [deviceId],
        },
        {
          grant,
          principalId,
          nowMs: clock(),
        },
      );
    },
  };
}

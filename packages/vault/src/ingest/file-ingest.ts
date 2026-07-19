import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { SensitivityLevel } from '@semblance/protocol';
import { createDeletionTombstoneInput } from '../deletion/tombstone.js';
import type { VaultEventLog } from '../event-log/index.js';
import { VaultEventLogError } from '../event-log/errors.js';
import type { VaultEventLogWriter } from '../event-log/writer.js';
import { createSourceRef } from '../provenance/source-ref.js';

/** Matches @semblance/core VaultFileIngestIndexedParams — kept local to avoid vault→core dependency. */
export interface VaultFileIngestIndexedParams {
  file: {
    absolutePath: string;
    basename: string;
    mimeType: string;
    contentHash?: string;
    byteLength?: number;
    lastModified?: string;
    extension?: string;
  };
  documentId: string;
  deduplicated: boolean;
  occurredAt?: string;
}

/** Matches @semblance/core VaultFileIngestDeletedParams — kept local to avoid vault→core dependency. */
export interface VaultFileIngestDeletedParams {
  absolutePath: string;
  documentId: string;
  sourceEventId?: string;
  occurredAt?: string;
}

export interface VaultFileIngestHooks {
  onFileIndexed(params: VaultFileIngestIndexedParams): void | Promise<void>;
  onFileDeleted(params: VaultFileIngestDeletedParams): void | Promise<void>;
}

export function hashAbsolutePath(absolutePath: string): string {
  return createHash('sha256').update(absolutePath, 'utf-8').digest('hex');
}

export function buildFileSourceId(absolutePath: string): string {
  return `file:${hashAbsolutePath(absolutePath)}`;
}

export function buildFileSourceUri(absolutePath: string): string {
  return `file://hash/${hashAbsolutePath(absolutePath)}`;
}

export function buildFileIngestEventId(absolutePath: string): string {
  return `vault-file-ingest-v1-${hashAbsolutePath(absolutePath).slice(0, 32)}`;
}

export function buildFileDeletionEventId(absolutePath: string): string {
  return `vault-file-deleted-v1-${hashAbsolutePath(absolutePath).slice(0, 32)}`;
}

export interface ScannedFileIngestInput {
  absolutePath: string;
  basename: string;
  mimeType: string;
  documentId: string;
  contentHash?: string;
  byteLength?: number;
  lastModified?: string;
  extension?: string;
}

export function buildFileIngestPayload(file: ScannedFileIngestInput): Record<string, unknown> {
  return {
    schemaVersion: 1,
    documentId: file.documentId,
    title: file.basename,
    mimeType: file.mimeType,
    pathHash: hashAbsolutePath(file.absolutePath),
    byteLength: file.byteLength,
    contentHash: file.contentHash,
    lastModified: file.lastModified,
    extension: file.extension,
  };
}

export interface IngestFileToVaultParams {
  file: ScannedFileIngestInput;
  writer: VaultEventLogWriter;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  occurredAt?: string;
  existingEventIds?: Set<string>;
}

export interface IngestFileToVaultResult {
  eventId: string;
  sourceId: string;
  skipped: boolean;
}

export function ingestFileToVault(params: IngestFileToVaultParams): IngestFileToVaultResult {
  const eventId = buildFileIngestEventId(params.file.absolutePath);
  const sourceId = buildFileSourceId(params.file.absolutePath);

  if (params.existingEventIds?.has(eventId)) {
    return { eventId, sourceId, skipped: true };
  }

  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const sourceRef = createSourceRef({
    sourceId,
    sourceType: 'file',
    uri: buildFileSourceUri(params.file.absolutePath),
    ingestedAt: occurredAt,
  });

  try {
    params.writer.append({
      eventId,
      dataDomain: 'documents',
      deviceId: params.deviceId,
      membershipEpoch: params.membershipEpoch,
      eventType: 'source_ingested',
      sourceRefs: [sourceRef],
      sensitivity: params.sensitivity ?? 'personal',
      occurredAt,
      payloadPlaintext: JSON.stringify(buildFileIngestPayload(params.file)),
    });
  } catch (error) {
    if (error instanceof VaultEventLogError && error.code === 'DUPLICATE_EVENT_ID') {
      params.existingEventIds?.add(eventId);
      return { eventId, sourceId, skipped: true };
    }
    throw error;
  }

  params.existingEventIds?.add(eventId);
  return { eventId, sourceId, skipped: false };
}

export interface IngestScannedFilesToVaultParams {
  files: ScannedFileIngestInput[];
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  existingEventIds?: Set<string>;
}

export function ingestScannedFilesToVault(params: IngestScannedFilesToVaultParams): {
  ingested: number;
  skipped: number;
  results: IngestFileToVaultResult[];
} {
  const results: IngestFileToVaultResult[] = [];
  let ingested = 0;
  let skipped = 0;

  for (const file of params.files) {
    const result = ingestFileToVault({
      file,
      writer: params.eventLog.writer,
      deviceId: params.deviceId,
      membershipEpoch: params.membershipEpoch,
      sensitivity: params.sensitivity,
      existingEventIds: params.existingEventIds,
    });
    results.push(result);
    if (result.skipped) {
      skipped += 1;
    } else {
      ingested += 1;
    }
  }

  return { ingested, skipped, results };
}

export interface AppendFileDeletedToVaultParams {
  absolutePath: string;
  documentId: string;
  writer: VaultEventLogWriter;
  deviceId: string;
  membershipEpoch: number;
  policyEpoch?: number;
  sensitivity?: SensitivityLevel;
  occurredAt?: string;
  sourceEventId?: string;
  existingEventIds?: Set<string>;
}

export interface AppendFileDeletedToVaultResult {
  eventId: string;
  skipped: boolean;
}

export function appendFileDeletedToVault(
  params: AppendFileDeletedToVaultParams,
): AppendFileDeletedToVaultResult {
  const eventId = buildFileDeletionEventId(params.absolutePath);

  if (params.existingEventIds?.has(eventId)) {
    return { eventId, skipped: true };
  }

  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const sourceRef = createSourceRef({
    sourceId: buildFileSourceId(params.absolutePath),
    sourceType: 'file',
    uri: buildFileSourceUri(params.absolutePath),
    ingestedAt: occurredAt,
  });

  const tombstoneInput = createDeletionTombstoneInput({
    eventId,
    entityId: params.documentId,
    entityType: 'document',
    dataDomain: 'documents',
    deviceId: params.deviceId,
    membershipEpoch: params.membershipEpoch,
    policyEpoch: params.policyEpoch ?? 1,
    sourceRefs: [sourceRef],
    sensitivity: params.sensitivity ?? 'personal',
    occurredAt,
    sourceEventId: params.sourceEventId,
  });

  try {
    params.writer.append({
      eventId: tombstoneInput.eventId,
      dataDomain: tombstoneInput.dataDomain,
      deviceId: tombstoneInput.deviceId,
      membershipEpoch: tombstoneInput.membershipEpoch,
      eventType: tombstoneInput.eventType,
      sourceRefs: tombstoneInput.sourceRefs,
      sensitivity: tombstoneInput.sensitivity,
      occurredAt: tombstoneInput.occurredAt,
      payloadPlaintext: tombstoneInput.payloadPlaintext,
    });
  } catch (error) {
    if (error instanceof VaultEventLogError && error.code === 'DUPLICATE_EVENT_ID') {
      params.existingEventIds?.add(eventId);
      return { eventId, skipped: true };
    }
    throw error;
  }

  params.existingEventIds?.add(eventId);
  return { eventId, skipped: false };
}

export interface CreateVaultFileIngestHooksOptions {
  eventLog: VaultEventLog;
  deviceId: string;
  membershipEpoch: number;
  sensitivity?: SensitivityLevel;
  policyEpoch?: number;
  existingEventIds?: Set<string>;
}

export function createVaultFileIngestHooks(
  options: CreateVaultFileIngestHooksOptions,
): VaultFileIngestHooks {
  const existingEventIds = options.existingEventIds ?? new Set<string>();
  const sourceEventIdByPath = new Map<string, string>();

  return {
    onFileIndexed(params: VaultFileIngestIndexedParams): void {
      const result = ingestFileToVault({
        file: {
          absolutePath: params.file.absolutePath,
          basename: params.file.basename,
          mimeType: params.file.mimeType,
          documentId: params.documentId,
          contentHash: params.file.contentHash,
          byteLength: params.file.byteLength,
          lastModified: params.file.lastModified,
          extension: params.file.extension,
        },
        writer: options.eventLog.writer,
        deviceId: options.deviceId,
        membershipEpoch: options.membershipEpoch,
        sensitivity: options.sensitivity,
        occurredAt: params.occurredAt,
        existingEventIds,
      });

      if (!result.skipped) {
        sourceEventIdByPath.set(params.file.absolutePath, result.eventId);
      }
    },

    onFileDeleted(params: VaultFileIngestDeletedParams): void {
      appendFileDeletedToVault({
        absolutePath: params.absolutePath,
        documentId: params.documentId,
        writer: options.eventLog.writer,
        deviceId: options.deviceId,
        membershipEpoch: options.membershipEpoch,
        policyEpoch: options.policyEpoch,
        sensitivity: options.sensitivity,
        occurredAt: params.occurredAt,
        sourceEventId: params.sourceEventId ?? sourceEventIdByPath.get(params.absolutePath),
        existingEventIds,
      });
    },
  };
}

export function scannedFileToIngestInput(params: {
  absolutePath: string;
  documentId: string;
  mimeType: string;
  contentHash?: string;
  byteLength?: number;
  lastModified?: string;
  extension?: string;
}): ScannedFileIngestInput {
  return {
    absolutePath: params.absolutePath,
    basename: basename(params.absolutePath),
    mimeType: params.mimeType,
    documentId: params.documentId,
    contentHash: params.contentHash,
    byteLength: params.byteLength,
    lastModified: params.lastModified,
    extension: params.extension,
  };
}

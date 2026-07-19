/**
 * Injectable hooks for dual-writing local file index results into the vault event log.
 * Implementation lives in @semblance/vault — core defines only the wiring contract.
 */

export interface VaultFileIngestFileInfo {
  absolutePath: string;
  basename: string;
  mimeType: string;
  contentHash?: string;
  byteLength?: number;
  lastModified?: string;
  extension?: string;
}

export interface VaultFileIngestIndexedParams {
  file: VaultFileIngestFileInfo;
  documentId: string;
  deduplicated: boolean;
  occurredAt?: string;
}

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

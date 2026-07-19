import type { VaultReadQueryV1 } from '@semblance/protocol';
import type { VaultChatChunk } from './vault-chat-grounding.js';

/** Minimal read authorizer — matches @semblance/vault VaultCapabilityClient.authorizeRead. */
export interface VaultReadAuthorizer {
  authorizeRead(query: VaultReadQueryV1): void;
}

export interface BuildVaultChatContextInput {
  authorizer: VaultReadAuthorizer;
  query: string;
  limit: number;
  /** Projection/search results available only after capability authorization. */
  searchDocuments: (query: string, limit: number) => VaultChatChunk[];
}

export interface BuildVaultChatContextResult {
  chunks: VaultChatChunk[];
  authorizedSourceIds: Set<string>;
}

/**
 * Build chat grounding context from vault document search after capability authorization.
 * Returns only chunks whose sourceIds were produced by the authorized search pass.
 */
export function buildVaultChatContext(
  input: BuildVaultChatContextInput,
): BuildVaultChatContextResult {
  const readQuery: VaultReadQueryV1 = {
    kind: 'document_search',
    text: input.query,
    limit: input.limit,
  };

  input.authorizer.authorizeRead(readQuery);

  const chunks = input.searchDocuments(input.query, input.limit).slice(0, input.limit);
  const authorizedSourceIds = new Set(chunks.map((chunk) => chunk.sourceId));

  return { chunks, authorizedSourceIds };
}

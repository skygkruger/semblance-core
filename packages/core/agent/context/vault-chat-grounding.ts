/**
 * Optional vault-backed chat retrieval contract.
 * Concrete implementations live outside core (e.g. @semblance/vault) to avoid
 * circular dependencies and keep crypto/capability issuance out of the AI Core.
 */

export interface VaultChatChunk {
  sourceId: string;
  title: string;
  text: string;
}

export interface VaultChatGrounding {
  retrieve(
    query: string,
    limit: number,
  ): Promise<{ chunks: VaultChatChunk[]; grantId: string }>;
  validateCitations(
    grantId: string,
    citedSourceIds: string[],
  ): { ok: true } | { ok: false; rejected: string[] };
}

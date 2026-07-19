/** Citations emitted by the model when vault grounding is active. */
export const VAULT_CITATION_PATTERN = /\[\[source:([^\]]+)\]\]/g;

export function extractVaultSourceCitations(text: string): string[] {
  const cited: string[] = [];
  for (const match of text.matchAll(VAULT_CITATION_PATTERN)) {
    const sourceId = match[1]?.trim();
    if (sourceId && sourceId.length > 0) {
      cited.push(sourceId);
    }
  }
  return cited;
}

export function validateVaultCitations(
  authorizedSourceIds: ReadonlySet<string> | readonly string[],
  citedSourceIds: readonly string[],
): { ok: true } | { ok: false; rejected: string[] } {
  const authorized =
    authorizedSourceIds instanceof Set
      ? authorizedSourceIds
      : new Set(authorizedSourceIds);

  const rejected = citedSourceIds.filter((sourceId) => !authorized.has(sourceId));
  if (rejected.length > 0) {
    return { ok: false, rejected };
  }
  return { ok: true };
}

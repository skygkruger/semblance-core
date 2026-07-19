import { SourceRefV1 as SourceRefV1Schema, type SourceRefV1 } from '@semblance/protocol';

export type { SourceRefV1 };

export interface CreateSourceRefInput {
  sourceId: string;
  sourceType: string;
  uri: string;
  ingestedAt: string;
}

export function parseSourceRef(value: unknown): SourceRefV1 {
  return SourceRefV1Schema.parse(value);
}

export function parseSourceRefs(values: unknown): SourceRefV1[] {
  if (!Array.isArray(values)) {
    throw new Error('sourceRefs must be an array');
  }

  return values.map((entry) => parseSourceRef(entry));
}

export function createSourceRef(input: CreateSourceRefInput): SourceRefV1 {
  return parseSourceRef({
    schemaVersion: 1,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    uri: input.uri,
    ingestedAt: input.ingestedAt,
  });
}

export function assertSourceRefsPresent(sourceRefs: SourceRefV1[] | undefined): asserts sourceRefs is SourceRefV1[] {
  if (sourceRefs === undefined) {
    throw new Error('sourceRefs are required');
  }

  if (!Array.isArray(sourceRefs)) {
    throw new Error('sourceRefs must be an array');
  }
}

export function hasNonEmptySourceRefs(sourceRefs: SourceRefV1[]): boolean {
  return sourceRefs.length > 0;
}

export function mergeSourceRefs(
  existing: SourceRefV1[],
  additional: SourceRefV1[] | undefined,
): SourceRefV1[] {
  if (!additional || additional.length === 0) {
    return [...existing];
  }

  const seen = new Set(existing.map((ref) => `${ref.sourceType}:${ref.sourceId}:${ref.uri}`));
  const merged = [...existing];

  for (const ref of additional) {
    const key = `${ref.sourceType}:${ref.sourceId}:${ref.uri}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(ref);
  }

  return merged;
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const EXTENSION_REVOCATION_SCHEMA_VERSION = 1 as const;

export type ExtensionOwnership = 'built-in' | 'user-local' | 'marketplace';

export interface ExtensionPublisherRevocation {
  readonly publisherKeyId: string;
  readonly reason: string;
  readonly revokedAt: string;
  readonly active: boolean;
}

export interface ExtensionArtifactRevocation {
  readonly manifestId: string;
  readonly artifactHash: string | null;
  readonly reason: string;
  readonly revokedAt: string;
  readonly active: boolean;
}

export interface ExtensionRevocationDocument {
  readonly schemaVersion: typeof EXTENSION_REVOCATION_SCHEMA_VERSION;
  readonly publishers: readonly ExtensionPublisherRevocation[];
  readonly artifacts: readonly ExtensionArtifactRevocation[];
  readonly updatedAt: string;
}

export type ExtensionRevocationLoadAction = 'allow' | 'reject' | 'quarantine' | 'degraded';

export interface ExtensionRevocationLoadEvaluation {
  readonly action: ExtensionRevocationLoadAction;
  readonly reason: string;
  readonly degradedPolicy: boolean;
  readonly quarantined: boolean;
}

export interface RevokePublisherInput {
  readonly publisherKeyId: string;
  readonly reason: string;
  readonly revokedAt?: string;
}

export interface RevokeArtifactInput {
  readonly manifestId: string;
  readonly artifactHash?: string | null;
  readonly reason: string;
  readonly revokedAt?: string;
}

function normalizePublisherRevocation(input: unknown): ExtensionPublisherRevocation | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Partial<ExtensionPublisherRevocation>;
  if (
    typeof record.publisherKeyId !== 'string'
    || record.publisherKeyId.length === 0
    || typeof record.reason !== 'string'
    || record.reason.length === 0
    || typeof record.revokedAt !== 'string'
    || record.revokedAt.length === 0
  ) {
    return null;
  }
  return {
    publisherKeyId: record.publisherKeyId,
    reason: record.reason,
    revokedAt: record.revokedAt,
    active: record.active !== false,
  };
}

function normalizeArtifactRevocation(input: unknown): ExtensionArtifactRevocation | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Partial<ExtensionArtifactRevocation>;
  if (
    typeof record.manifestId !== 'string'
    || record.manifestId.length === 0
    || typeof record.reason !== 'string'
    || record.reason.length === 0
    || typeof record.revokedAt !== 'string'
    || record.revokedAt.length === 0
  ) {
    return null;
  }
  return {
    manifestId: record.manifestId,
    artifactHash: typeof record.artifactHash === 'string' ? record.artifactHash : null,
    reason: record.reason,
    revokedAt: record.revokedAt,
    active: record.active !== false,
  };
}

export function createDefaultExtensionRevocationDocument(
  now = new Date(),
): ExtensionRevocationDocument {
  return {
    schemaVersion: EXTENSION_REVOCATION_SCHEMA_VERSION,
    publishers: [],
    artifacts: [],
    updatedAt: now.toISOString(),
  };
}

export function normalizeExtensionRevocationDocument(
  input: unknown,
  now = new Date(),
): ExtensionRevocationDocument {
  const defaults = createDefaultExtensionRevocationDocument(now);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }
  const record = input as Partial<ExtensionRevocationDocument>;
  const publishers = Array.isArray(record.publishers)
    ? record.publishers
        .map((entry) => normalizePublisherRevocation(entry))
        .filter((entry): entry is ExtensionPublisherRevocation => entry !== null)
    : [];
  const artifacts = Array.isArray(record.artifacts)
    ? record.artifacts
        .map((entry) => normalizeArtifactRevocation(entry))
        .filter((entry): entry is ExtensionArtifactRevocation => entry !== null)
    : [];
  return {
    schemaVersion: EXTENSION_REVOCATION_SCHEMA_VERSION,
    publishers,
    artifacts,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now.toISOString(),
  };
}

export function loadExtensionRevocationDocument(filePath: string): ExtensionRevocationDocument {
  if (!existsSync(filePath)) {
    return createDefaultExtensionRevocationDocument();
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return normalizeExtensionRevocationDocument(parsed);
  } catch {
    return createDefaultExtensionRevocationDocument();
  }
}

export function saveExtensionRevocationDocument(
  filePath: string,
  document: ExtensionRevocationDocument,
): ExtensionRevocationDocument {
  const normalized = normalizeExtensionRevocationDocument(document);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

/**
 * Offline user-owned extensions are not arbitrarily disabled when a publisher
 * is revoked. Instead the Kernel presents an explicit degraded policy flag so
 * the UI can warn while the user retains local control.
 */
export function evaluateRevocationLoadPolicy(
  document: ExtensionRevocationDocument,
  input: {
    publisherKeyId: string;
    manifestId: string;
    artifactHash: string;
    ownership: ExtensionOwnership;
  },
): ExtensionRevocationLoadEvaluation {
  const artifactRevocation = document.artifacts.find(
    (entry) =>
      entry.active
      && entry.manifestId === input.manifestId
      && (entry.artifactHash === null || entry.artifactHash === input.artifactHash),
  );
  if (artifactRevocation) {
    if (input.ownership === 'user-local') {
      return {
        action: 'degraded',
        reason: artifactRevocation.reason,
        degradedPolicy: true,
        quarantined: false,
      };
    }
    return {
      action: 'quarantine',
      reason: artifactRevocation.reason,
      degradedPolicy: false,
      quarantined: true,
    };
  }

  const publisherRevocation = document.publishers.find(
    (entry) => entry.active && entry.publisherKeyId === input.publisherKeyId,
  );
  if (publisherRevocation) {
    if (input.ownership === 'user-local') {
      return {
        action: 'degraded',
        reason: publisherRevocation.reason,
        degradedPolicy: true,
        quarantined: false,
      };
    }
    return {
      action: 'quarantine',
      reason: publisherRevocation.reason,
      degradedPolicy: false,
      quarantined: true,
    };
  }

  return {
    action: 'allow',
    reason: 'not_revoked',
    degradedPolicy: false,
    quarantined: false,
  };
}

export class ExtensionRevocationStore {
  private document: ExtensionRevocationDocument;

  constructor(initial: ExtensionRevocationDocument) {
    this.document = normalizeExtensionRevocationDocument(initial);
  }

  static fromFile(filePath: string): ExtensionRevocationStore {
    return new ExtensionRevocationStore(loadExtensionRevocationDocument(filePath));
  }

  getDocument(): ExtensionRevocationDocument {
    return this.document;
  }

  listRevocations(): ExtensionRevocationDocument {
    return this.document;
  }

  isPublisherRevoked(publisherKeyId: string): boolean {
    return this.document.publishers.some(
      (entry) => entry.active && entry.publisherKeyId === publisherKeyId,
    );
  }

  isArtifactRevoked(manifestId: string, artifactHash: string): boolean {
    return this.document.artifacts.some(
      (entry) =>
        entry.active
        && entry.manifestId === manifestId
        && (entry.artifactHash === null || entry.artifactHash === artifactHash),
    );
  }

  revokePublisher(input: RevokePublisherInput, now = new Date()): ExtensionPublisherRevocation {
    const revokedAt = input.revokedAt ?? now.toISOString();
    const next: ExtensionPublisherRevocation = {
      publisherKeyId: input.publisherKeyId,
      reason: input.reason,
      revokedAt,
      active: true,
    };
    const publishers = this.document.publishers.filter(
      (entry) => entry.publisherKeyId !== input.publisherKeyId,
    );
    publishers.push(next);
    this.document = normalizeExtensionRevocationDocument(
      {
        ...this.document,
        publishers,
        updatedAt: now.toISOString(),
      },
      now,
    );
    return next;
  }

  revokeArtifact(input: RevokeArtifactInput, now = new Date()): ExtensionArtifactRevocation {
    const revokedAt = input.revokedAt ?? now.toISOString();
    const next: ExtensionArtifactRevocation = {
      manifestId: input.manifestId,
      artifactHash: input.artifactHash ?? null,
      reason: input.reason,
      revokedAt,
      active: true,
    };
    const artifacts = this.document.artifacts.filter(
      (entry) => entry.manifestId !== input.manifestId,
    );
    artifacts.push(next);
    this.document = normalizeExtensionRevocationDocument(
      {
        ...this.document,
        artifacts,
        updatedAt: now.toISOString(),
      },
      now,
    );
    return next;
  }

  evaluateLoadPolicy(input: {
    publisherKeyId: string;
    manifestId: string;
    artifactHash: string;
    ownership: ExtensionOwnership;
  }): ExtensionRevocationLoadEvaluation {
    return evaluateRevocationLoadPolicy(this.document, input);
  }

  setDocument(next: ExtensionRevocationDocument, now = new Date()): ExtensionRevocationDocument {
    this.document = normalizeExtensionRevocationDocument(next, now);
    return this.document;
  }
}

export function createExtensionRevocationStore(
  initial?: ExtensionRevocationDocument,
): ExtensionRevocationStore {
  return new ExtensionRevocationStore(initial ?? createDefaultExtensionRevocationDocument());
}

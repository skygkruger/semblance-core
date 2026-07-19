import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  loadDrPublisherKeys,
  type DrPublisherKeyRecord,
} from '@semblance/extension-sdk';

export const EXTENSION_PUBLISHER_TRUST_SCHEMA_VERSION = 1 as const;

export type ExtensionPublisherTrustLevel = 'built-in' | 'user-trusted' | 'organization-trusted';

export type ExtensionPublisherTrustSource = 'system' | 'user' | 'organization';

export interface ExtensionPublisherRecord {
  readonly publisherId: string;
  readonly displayName: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly trustLevel: ExtensionPublisherTrustLevel;
  readonly trustedAt: string;
  readonly trustedBy: ExtensionPublisherTrustSource;
}

export interface ExtensionPublisherTrustDocument {
  readonly schemaVersion: typeof EXTENSION_PUBLISHER_TRUST_SCHEMA_VERSION;
  readonly publishers: readonly ExtensionPublisherRecord[];
  readonly updatedAt: string;
}

export interface TrustPublisherInput {
  readonly publisherId: string;
  readonly displayName: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly trustLevel: Exclude<ExtensionPublisherTrustLevel, 'built-in'>;
  readonly trustedBy?: ExtensionPublisherTrustSource;
  readonly trustedAt?: string;
}

function isTrustLevel(value: unknown): value is ExtensionPublisherTrustLevel {
  return value === 'built-in' || value === 'user-trusted' || value === 'organization-trusted';
}

function isTrustSource(value: unknown): value is ExtensionPublisherTrustSource {
  return value === 'system' || value === 'user' || value === 'organization';
}

function normalizePublisherRecord(input: unknown): ExtensionPublisherRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Partial<ExtensionPublisherRecord>;
  if (
    typeof record.publisherId !== 'string'
    || record.publisherId.length === 0
    || typeof record.displayName !== 'string'
    || record.displayName.length === 0
    || typeof record.keyId !== 'string'
    || record.keyId.length === 0
    || typeof record.publicKeyPem !== 'string'
    || record.publicKeyPem.length === 0
    || !isTrustLevel(record.trustLevel)
    || typeof record.trustedAt !== 'string'
    || record.trustedAt.length === 0
    || !isTrustSource(record.trustedBy)
  ) {
    return null;
  }
  return {
    publisherId: record.publisherId,
    displayName: record.displayName,
    keyId: record.keyId,
    publicKeyPem: record.publicKeyPem,
    trustLevel: record.trustLevel,
    trustedAt: record.trustedAt,
    trustedBy: record.trustedBy,
  };
}

export function createDefaultExtensionPublisherTrustDocument(
  now = new Date(),
): ExtensionPublisherTrustDocument {
  return {
    schemaVersion: EXTENSION_PUBLISHER_TRUST_SCHEMA_VERSION,
    publishers: [],
    updatedAt: now.toISOString(),
  };
}

export function bootstrapBuiltInPublishers(
  builtInKeys: DrPublisherKeyRecord[],
  now = new Date(),
): ExtensionPublisherRecord[] {
  return builtInKeys.map((key) => ({
    publisherId: key.keyId,
    displayName: key.purpose ?? key.keyId,
    keyId: key.keyId,
    publicKeyPem: key.publicKeyPem,
    trustLevel: 'built-in' as const,
    trustedAt: now.toISOString(),
    trustedBy: 'system' as const,
  }));
}

export function normalizeExtensionPublisherTrustDocument(
  input: unknown,
  builtInKeys: DrPublisherKeyRecord[] = loadDrPublisherKeys(),
  now = new Date(),
): ExtensionPublisherTrustDocument {
  const defaults = createDefaultExtensionPublisherTrustDocument(now);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ...defaults,
      publishers: bootstrapBuiltInPublishers(builtInKeys, now),
      updatedAt: now.toISOString(),
    };
  }

  const record = input as Partial<ExtensionPublisherTrustDocument>;
  const parsedPublishers = Array.isArray(record.publishers)
    ? record.publishers
        .map((entry) => normalizePublisherRecord(entry))
        .filter((entry): entry is ExtensionPublisherRecord => entry !== null)
    : [];

  const byKeyId = new Map<string, ExtensionPublisherRecord>();
  for (const builtIn of bootstrapBuiltInPublishers(builtInKeys, now)) {
    byKeyId.set(builtIn.keyId, builtIn);
  }
  for (const publisher of parsedPublishers) {
    if (publisher.trustLevel === 'built-in') {
      byKeyId.set(publisher.keyId, publisher);
      continue;
    }
    byKeyId.set(publisher.keyId, publisher);
  }

  return {
    schemaVersion: EXTENSION_PUBLISHER_TRUST_SCHEMA_VERSION,
    publishers: [...byKeyId.values()],
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now.toISOString(),
  };
}

export function loadExtensionPublisherTrustDocument(
  filePath: string,
  builtInKeysPath?: string,
): ExtensionPublisherTrustDocument {
  const builtInKeys = loadDrPublisherKeys(builtInKeysPath);
  if (!existsSync(filePath)) {
    return normalizeExtensionPublisherTrustDocument(undefined, builtInKeys);
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
    return normalizeExtensionPublisherTrustDocument(parsed, builtInKeys);
  } catch {
    return normalizeExtensionPublisherTrustDocument(undefined, builtInKeys);
  }
}

export function saveExtensionPublisherTrustDocument(
  filePath: string,
  document: ExtensionPublisherTrustDocument,
): ExtensionPublisherTrustDocument {
  const normalized = normalizeExtensionPublisherTrustDocument(document);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export class ExtensionPublisherTrustStore {
  private document: ExtensionPublisherTrustDocument;
  private readonly builtInKeys: DrPublisherKeyRecord[];

  constructor(initial: ExtensionPublisherTrustDocument, builtInKeys?: DrPublisherKeyRecord[]) {
    this.builtInKeys = builtInKeys ?? loadDrPublisherKeys();
    this.document = normalizeExtensionPublisherTrustDocument(initial, this.builtInKeys);
  }

  static fromFile(filePath: string, builtInKeysPath?: string): ExtensionPublisherTrustStore {
    const builtInKeys = loadDrPublisherKeys(builtInKeysPath);
    return new ExtensionPublisherTrustStore(
      loadExtensionPublisherTrustDocument(filePath, builtInKeysPath),
      builtInKeys,
    );
  }

  getDocument(): ExtensionPublisherTrustDocument {
    return this.document;
  }

  listPublishers(): readonly ExtensionPublisherRecord[] {
    return this.document.publishers;
  }

  getPublisherByKeyId(keyId: string): ExtensionPublisherRecord | undefined {
    return this.document.publishers.find((publisher) => publisher.keyId === keyId);
  }

  getPublisherById(publisherId: string): ExtensionPublisherRecord | undefined {
    return this.document.publishers.find((publisher) => publisher.publisherId === publisherId);
  }

  getPublisherKeys(): DrPublisherKeyRecord[] {
    return this.document.publishers.map((publisher) => ({
      keyId: publisher.keyId,
      algorithm: 'Ed25519' as const,
      publicKeyPem: publisher.publicKeyPem,
      purpose: publisher.displayName,
    }));
  }

  trustPublisher(input: TrustPublisherInput, now = new Date()): ExtensionPublisherRecord {
    const trustedAt = input.trustedAt ?? now.toISOString();
    const trustedBy = input.trustedBy ?? 'user';
    const nextRecord: ExtensionPublisherRecord = {
      publisherId: input.publisherId,
      displayName: input.displayName,
      keyId: input.keyId,
      publicKeyPem: input.publicKeyPem,
      trustLevel: input.trustLevel,
      trustedAt,
      trustedBy,
    };

    const publishers = this.document.publishers.filter((publisher) => publisher.keyId !== input.keyId);
    publishers.push(nextRecord);
    this.document = normalizeExtensionPublisherTrustDocument(
      {
        ...this.document,
        publishers,
        updatedAt: now.toISOString(),
      },
      this.builtInKeys,
      now,
    );
    return nextRecord;
  }

  setDocument(next: ExtensionPublisherTrustDocument, now = new Date()): ExtensionPublisherTrustDocument {
    this.document = normalizeExtensionPublisherTrustDocument(next, this.builtInKeys, now);
    return this.document;
  }
}

export function createExtensionPublisherTrustStore(
  initial?: ExtensionPublisherTrustDocument,
  builtInKeys?: DrPublisherKeyRecord[],
): ExtensionPublisherTrustStore {
  return new ExtensionPublisherTrustStore(
    initial ?? createDefaultExtensionPublisherTrustDocument(),
    builtInKeys,
  );
}

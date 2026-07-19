import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compareSemver, sha256Prefixed } from '@semblance/extension-sdk';

export const MARKETPLACE_CATALOG_SCHEMA_VERSION = 1 as const;
export const MARKETPLACE_REVIEW_LEVELS = ['unsigned', 'publisher-verified', 'community'] as const;
export type MarketplaceReviewLevel = (typeof MARKETPLACE_REVIEW_LEVELS)[number];

/** Revenue-share commerce metadata — must never include user content. */
export interface MarketplacePricingDeclarationV1 {
  readonly model: 'free' | 'one_time' | 'subscription';
  readonly currency: string;
  readonly amountCents: number;
  readonly revenueShareBps: number;
}

export interface MarketplaceCatalogEntryV1 {
  readonly schemaVersion: typeof MARKETPLACE_CATALOG_SCHEMA_VERSION;
  readonly manifestId: string;
  readonly publisher: string;
  readonly version: string;
  readonly artifactHash: string;
  readonly manifestHash: string;
  readonly minCoreVersion: string;
  readonly reviewLevel: MarketplaceReviewLevel;
  readonly pricing: MarketplacePricingDeclarationV1;
  readonly compatibilityNotes: string;
}

export interface MarketplaceCatalogDocumentV1 {
  readonly schemaVersion: typeof MARKETPLACE_CATALOG_SCHEMA_VERSION;
  readonly entries: readonly MarketplaceCatalogEntryV1[];
  readonly disclaimer: string;
}

export interface VerifyMarketplaceEntryInput {
  readonly entry: MarketplaceCatalogEntryV1;
  readonly manifestBytes: Buffer;
  readonly artifactBytes: Buffer;
  readonly coreVersion: string;
}

export interface VerifyMarketplaceEntryResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const FORBIDDEN_USER_CONTENT_KEYS = [
  'userContent',
  'userData',
  'documents',
  'messages',
  'emails',
  'files',
  'vaultSnapshot',
  'personalData',
] as const;

export const MARKETPLACE_NO_ENDORSEMENT_DISCLAIMER =
  'Catalog entries indicate publisher signature and review level only. Semblance does not endorse third-party capabilities beyond the stated review level.';

export function createDefaultMarketplaceCatalog(): MarketplaceCatalogDocumentV1 {
  return {
    schemaVersion: MARKETPLACE_CATALOG_SCHEMA_VERSION,
    entries: [],
    disclaimer: MARKETPLACE_NO_ENDORSEMENT_DISCLAIMER,
  };
}

/** Assert commerce catalog/revenue-share payloads store no user content fields. */
export function assertMarketplaceStoresNoUserContent(payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return;
  }
  const record = payload as Record<string, unknown>;
  for (const key of FORBIDDEN_USER_CONTENT_KEYS) {
    if (key in record) {
      throw new Error(`Marketplace commerce payload must not store user content field '${key}'`);
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') {
      assertMarketplaceStoresNoUserContent(value);
    }
  }
}

export function normalizeMarketplaceCatalog(input: unknown): MarketplaceCatalogDocumentV1 {
  const defaults = createDefaultMarketplaceCatalog();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }
  const record = input as Partial<MarketplaceCatalogDocumentV1>;
  const entries = Array.isArray(record.entries)
    ? record.entries.filter((entry): entry is MarketplaceCatalogEntryV1 => isCatalogEntry(entry))
    : [];
  assertMarketplaceStoresNoUserContent(record);
  for (const entry of entries) {
    assertMarketplaceStoresNoUserContent(entry);
    assertMarketplaceStoresNoUserContent(entry.pricing);
  }
  return {
    schemaVersion: MARKETPLACE_CATALOG_SCHEMA_VERSION,
    entries,
    disclaimer:
      typeof record.disclaimer === 'string' && record.disclaimer.length > 0
        ? record.disclaimer
        : MARKETPLACE_NO_ENDORSEMENT_DISCLAIMER,
  };
}

function isCatalogEntry(value: unknown): value is MarketplaceCatalogEntryV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<MarketplaceCatalogEntryV1>;
  return (
    record.schemaVersion === MARKETPLACE_CATALOG_SCHEMA_VERSION
    && typeof record.manifestId === 'string'
    && typeof record.publisher === 'string'
    && typeof record.version === 'string'
    && typeof record.artifactHash === 'string'
    && typeof record.manifestHash === 'string'
    && typeof record.minCoreVersion === 'string'
    && typeof record.reviewLevel === 'string'
    && MARKETPLACE_REVIEW_LEVELS.includes(record.reviewLevel as MarketplaceReviewLevel)
    && record.pricing !== null
    && typeof record.pricing === 'object'
    && typeof record.compatibilityNotes === 'string'
  );
}

export function loadMarketplaceCatalog(filePath: string): MarketplaceCatalogDocumentV1 {
  const absolute = resolve(filePath);
  if (!existsSync(absolute)) {
    return createDefaultMarketplaceCatalog();
  }
  const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
  return normalizeMarketplaceCatalog(parsed);
}

export function verifyMarketplaceCatalogEntry(
  input: VerifyMarketplaceEntryInput,
): VerifyMarketplaceEntryResult {
  const errors: string[] = [];
  const { entry, manifestBytes, artifactBytes, coreVersion } = input;

  assertMarketplaceStoresNoUserContent(entry);

  const manifestHash = sha256Prefixed(manifestBytes);
  const artifactHash = sha256Prefixed(artifactBytes);

  if (manifestHash !== entry.manifestHash) {
    errors.push('manifestHash mismatch');
  }
  if (artifactHash !== entry.artifactHash) {
    errors.push('artifactHash mismatch');
  }
  if (compareSemver(coreVersion, entry.minCoreVersion) < 0) {
    errors.push(`coreVersion ${coreVersion} below minCoreVersion ${entry.minCoreVersion}`);
  }

  return { ok: errors.length === 0, errors };
}

export function publishMarketplaceEntry(
  catalog: MarketplaceCatalogDocumentV1,
  entry: MarketplaceCatalogEntryV1,
  manifestBytes: Buffer,
  artifactBytes: Buffer,
  coreVersion: string,
): { catalog: MarketplaceCatalogDocumentV1; verification: VerifyMarketplaceEntryResult } {
  assertMarketplaceStoresNoUserContent(entry);
  const verification = verifyMarketplaceCatalogEntry({
    entry,
    manifestBytes,
    artifactBytes,
    coreVersion,
  });
  if (!verification.ok) {
    return { catalog, verification };
  }
  const withoutExisting = catalog.entries.filter(
    (existing) => existing.manifestId !== entry.manifestId,
  );
  return {
    catalog: normalizeMarketplaceCatalog({
      ...catalog,
      entries: [...withoutExisting, entry],
    }),
    verification,
  };
}

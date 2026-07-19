import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertMarketplaceStoresNoUserContent,
  loadMarketplaceCatalog,
  MARKETPLACE_NO_ENDORSEMENT_DISCLAIMER,
  publishMarketplaceEntry,
} from '../src/extension/marketplace-catalog.js';
import { sha256Prefixed } from '@semblance/extension-sdk';

describe('marketplace catalog lite', () => {
  it('loads checked-in catalog with no-endorsement disclaimer', () => {
    const catalogPath = join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      'release',
      'extensions',
      'marketplace-catalog.v1.json',
    );
    const catalog = loadMarketplaceCatalog(catalogPath);
    expect(catalog.disclaimer).toContain('does not endorse');
    expect(catalog.entries.length).toBeGreaterThan(0);
  });

  it('rejects commerce payloads that store user content', () => {
    expect(() =>
      assertMarketplaceStoresNoUserContent({
        pricing: { model: 'free', userData: ['email body'] },
      }),
    ).toThrow(/must not store user content/);
  });

  it('publishes signed artifact metadata with hash verification only', () => {
    const manifestBytes = Buffer.from('manifest-bytes');
    const artifactBytes = Buffer.from('artifact-bytes');
    const entry = {
      schemaVersion: 1 as const,
      manifestId: 'com.example.demo',
      publisher: 'com.example.dev',
      version: '1.0.0',
      artifactHash: sha256Prefixed(artifactBytes),
      manifestHash: sha256Prefixed(manifestBytes),
      minCoreVersion: '1.0.0',
      reviewLevel: 'publisher-verified' as const,
      pricing: {
        model: 'free' as const,
        currency: 'USD',
        amountCents: 0,
        revenueShareBps: 1500,
      },
      compatibilityNotes: 'Test entry',
    };
    const result = publishMarketplaceEntry(
      {
        schemaVersion: 1,
        entries: [],
        disclaimer: MARKETPLACE_NO_ENDORSEMENT_DISCLAIMER,
      },
      entry,
      manifestBytes,
      artifactBytes,
      '1.0.0',
    );
    expect(result.verification.ok).toBe(true);
    expect(result.catalog.entries).toHaveLength(1);
    expect(JSON.stringify(result.catalog)).not.toMatch(/userContent|personalData|vaultSnapshot/);
  });
});

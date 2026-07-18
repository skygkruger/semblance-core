import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyCrossRepoSlice } from '../../scripts/verify-cross-repo-slice.js';
import currentManifest from '../../release/release-manifest.json';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function write(path: string, contents: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function baseRepositories(
  core: string,
  representative: string,
  website: string,
) {
  return {
    core: {
      root: core,
      headCommit: 'a'.repeat(40),
      isAncestor: () => true,
      treeHash: () => 'b'.repeat(40),
    },
    representative: {
      root: representative,
      headCommit: 'c'.repeat(40),
      isAncestor: () => true,
      treeHash: () => 'd'.repeat(40),
    },
    website: {
      root: website,
      headCommit: 'e'.repeat(40),
      isAncestor: () => true,
      treeHash: () => 'f'.repeat(40),
    },
  };
}

function seedCommonFiles(core: string, representative: string, website: string, claims: string): {
  migrationReservation: string;
  migrationCommerce: string;
} {
  write(join(core, 'release', 'public-claims.v1.json'), claims);
  write(join(website, 'contracts', 'public-claims.v1.json'), claims);
  const fixture = JSON.stringify({
    sub: 'founder@example.test',
    type: 'founding',
    seat: 1,
    iat: 1772142036,
  });
  write(join(core, 'release', 'contracts', 'legacy-waitlist-token.fixture.json'), fixture);
  write(join(website, 'contracts', 'legacy-waitlist-token.fixture.json'), fixture);
  write(join(core, 'release', 'contracts', 'reservation-token-v0.schema.json'), '{}\n');
  write(
    join(website, 'legal', 'privacy.html'),
    '<p class="meta">Legal version: 2026-07-18 · Effective: 18 July 2026</p>\n',
  );
  const migrationReservation = join(
    representative,
    'docs',
    'release-manifests',
    'migrations',
    'slice-1-reservation-entitlement-split.json',
  );
  const migrationCommerce = join(
    representative,
    'docs',
    'release-manifests',
    'migrations',
    'slice-1-commerce-freeze.json',
  );
  write(
    migrationReservation,
    JSON.stringify({
      executableDefinition: {
        reservationContract: {
          schema: 'release/contracts/reservation-token-v0.schema.json',
          fixture: 'release/contracts/legacy-waitlist-token.fixture.json',
          classification: 'reservation_only',
        },
      },
    }),
  );
  write(migrationCommerce, '{}\n');
  return { migrationReservation, migrationCommerce };
}

function manifestWithMigrations(
  migrationReservation: string,
  migrationCommerce: string,
) {
  return {
    ...currentManifest,
    legalNoticesVersion: '2026-07-18',
    completedSlices: [] as number[],
    commerce: { newSalesEnabled: false, freezeEvidence: [] as string[] },
    evidence: [
      {
        id: 'migration-reservation-entitlement-split',
        repository: 'representative' as const,
        path: 'docs/release-manifests/migrations/slice-1-reservation-entitlement-split.json',
        sha256: sha256File(migrationReservation),
        requiredForStates: ['Implemented' as const],
      },
      {
        id: 'migration-commerce-freeze',
        repository: 'representative' as const,
        path: 'docs/release-manifests/migrations/slice-1-commerce-freeze.json',
        sha256: sha256File(migrationCommerce),
        requiredForStates: ['Implemented' as const],
      },
    ],
    features: currentManifest.features.map((feature) => ({
      ...feature,
      legalNoticesVersion: '2026-07-18',
    })),
    repositories: {
      core: {
        sourceCommit: 'a'.repeat(40),
        sourceTreeHash: 'b'.repeat(40),
      },
      representative: {
        sourceCommit: 'c'.repeat(40),
        sourceTreeHash: 'd'.repeat(40),
        packageVersion: '0.1.0',
        artifactHash: null,
        extensionManifestHash: null,
      },
      website: {
        sourceCommit: 'e'.repeat(40),
        sourceTreeHash: 'f'.repeat(40),
      },
    },
  };
}

describe('verifyCrossRepoSlice', () => {
  it('fails closed when production commerce freeze is awaiting operator approval', () => {
    const core = tempRoot('slice-core-');
    const representative = tempRoot('slice-rep-');
    const website = tempRoot('slice-web-');
    const { migrationReservation, migrationCommerce } = seedCommonFiles(
      core,
      representative,
      website,
      '{"schemaVersion":1}\n',
    );
    write(
      join(representative, 'docs', 'release-manifests', 'commerce-freeze-evidence.json'),
      JSON.stringify({
        productionFreezeStatus: 'awaiting_operator_approval',
        production: {
          status: 'NOT_EXECUTED',
          evidencePath: 'docs/release-manifests/evidence/slice-1/commerce-production.txt',
          workerScriptHash: null,
          webhookConfigHash: null,
          kvNamespaceIdHash: null,
          checkoutLinksDisabledHash: null,
          healthProbeHash: null,
          renewalVerifyHash: null,
          portalVerifyHash: null,
          quarantineVerifyHash: null,
        },
      }),
    );

    const result = verifyCrossRepoSlice({
      manifest: manifestWithMigrations(migrationReservation, migrationCommerce),
      repositories: baseRepositories(core, representative, website),
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toContain(
      'COMMERCE_PRODUCTION_FREEZE_PENDING',
    );
  });

  it('rejects mismatched public claims contracts', () => {
    const core = tempRoot('slice-claims-core-');
    const representative = tempRoot('slice-claims-rep-');
    const website = tempRoot('slice-claims-web-');
    const { migrationReservation, migrationCommerce } = seedCommonFiles(
      core,
      representative,
      website,
      '{"schemaVersion":1}\n',
    );
    write(join(website, 'contracts', 'public-claims.v1.json'), '{"schemaVersion":2}\n');
    write(
      join(representative, 'docs', 'release-manifests', 'commerce-freeze-evidence.json'),
      JSON.stringify({
        productionFreezeStatus: 'complete',
        production: {
          status: 'EXECUTED',
          evidencePath: 'docs/release-manifests/evidence/slice-1/commerce-production.txt',
          workerScriptHash: 'a'.repeat(64),
          webhookConfigHash: 'b'.repeat(64),
          kvNamespaceIdHash: 'c'.repeat(64),
          checkoutLinksDisabledHash: 'd'.repeat(64),
          healthProbeHash: 'e'.repeat(64),
          renewalVerifyHash: 'f'.repeat(64),
          portalVerifyHash: '1'.repeat(64),
          quarantineVerifyHash: '2'.repeat(64),
        },
      }),
    );
    write(
      join(
        representative,
        'docs',
        'release-manifests',
        'evidence',
        'slice-1',
        'commerce-production.txt',
      ),
      'ok\n',
    );

    const result = verifyCrossRepoSlice({
      manifest: manifestWithMigrations(migrationReservation, migrationCommerce),
      repositories: baseRepositories(core, representative, website),
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toContain('PUBLIC_CLAIMS_MISMATCH');
  });
});

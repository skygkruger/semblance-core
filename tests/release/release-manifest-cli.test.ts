import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJSON } from '../../packages/core/audit/merkle-chain.js';
import { sign as signEd25519 } from '../../packages/core/crypto/ed25519.js';
import currentManifest from '../../release/release-manifest.json';
import { generateEvidenceManifest } from '../../scripts/evidence-manifest.js';
import { verifyReleaseManifest } from '../../scripts/release-manifest.js';

const FIXTURE_ROOT = join(process.cwd(), 'tests', 'fixtures', 'release-manifests');
const PRIVATE_KEY = Buffer.from(
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  'hex',
);
const PUBLIC_KEY = Buffer.from(
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  'hex',
);

interface Manifest {
  [key: string]: unknown;
  signedArtifacts: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  repositories: Record<string, Record<string, unknown>>;
  features: Array<Record<string, unknown>>;
  commerce: Record<string, unknown>;
  completedSlices: number[];
  signatureKeyId: string;
  signature: string;
}

function loadFixture(name = 'released'): Manifest {
  return JSON.parse(readFileSync(join(FIXTURE_ROOT, `${name}.json`), 'utf8')) as Manifest;
}

function signManifest(manifest: Manifest): Manifest {
  for (const artifact of manifest.signedArtifacts) {
    artifact.signature = signEd25519(
      Buffer.from(String(artifact.sha256), 'utf8'),
      PRIVATE_KEY,
    ).toString('base64');
  }
  const { signature: _signature, ...signable } = manifest;
  manifest.signature = signEd25519(
    Buffer.from(canonicalJSON(signable), 'utf8'),
    PRIVATE_KEY,
  ).toString('base64');
  return manifest;
}

const fixtureRepositories = {
  trustedKeys: {
    schemaVersion: 1,
    keys: [{
      id: 'test-release-key',
      algorithm: 'Ed25519',
      publicKey: PUBLIC_KEY.toString('base64'),
      validFrom: '2024-01-01T00:00:00.000Z',
      validUntil: '2030-01-01T00:00:00.000Z',
    }],
  },
  now: new Date('2026-07-18T12:00:00.000Z'),
  repositories: {
    core: {
      root: '/fixtures/core',
      headCommit: 'f'.repeat(40),
      isAncestor: (commit: string) => commit === '1'.repeat(40),
      treeHash: () => 'a'.repeat(40),
    },
    representative: {
      root: '/fixtures/representative',
      headCommit: 'f'.repeat(40),
      isAncestor: (commit: string) => commit === '2'.repeat(40),
      treeHash: () => 'b'.repeat(40),
    },
    website: {
      root: '/fixtures/website',
      headCommit: 'f'.repeat(40),
      isAncestor: (commit: string) => commit === '3'.repeat(40),
      treeHash: () => 'c'.repeat(40),
    },
  },
  artifactRoot: '/fixtures/artifacts',
  readFile: (path: string) => {
    if (path === '/fixtures/artifacts/desktop.bin') return Buffer.from('artifact-bytes');
    if (path === '/fixtures/core/runtime.json') return Buffer.from('evidence-bytes');
    throw new Error(`missing fixture file: ${path}`);
  },
  realpath: (path: string) => path,
};

describe('release manifest CLI verification', () => {
  it('accepts the current unsigned truth baseline', async () => {
    const result = await verifyReleaseManifest(currentManifest, {
      ...fixtureRepositories,
      repositories: {
        core: {
          ...fixtureRepositories.repositories.core,
          isAncestor: (commit: string) => commit === currentManifest.repositories.core.sourceCommit,
          treeHash: () => currentManifest.repositories.core.sourceTreeHash,
        },
        representative: {
          ...fixtureRepositories.repositories.representative,
          isAncestor: (commit: string) => commit === currentManifest.repositories.representative.sourceCommit,
          treeHash: () => currentManifest.repositories.representative.sourceTreeHash,
        },
        website: {
          ...fixtureRepositories.repositories.website,
          isAncestor: (commit: string) => commit === currentManifest.repositories.website.sourceCommit,
          treeHash: () => currentManifest.repositories.website.sourceTreeHash,
        },
      },
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('never mutates the manifest in verification mode', async () => {
    const manifest = signManifest(loadFixture());
    const before = JSON.stringify(manifest);

    await verifyReleaseManifest(manifest, fixtureRepositories);

    expect(JSON.stringify(manifest)).toBe(before);
  });

  it('returns SOURCE_NOT_ANCESTOR for a missing pinned commit', async () => {
    const result = await verifyReleaseManifest(signManifest(loadFixture()), {
      ...fixtureRepositories,
      repositories: {
        ...fixtureRepositories.repositories,
        core: { ...fixtureRepositories.repositories.core, isAncestor: () => false },
      },
    });

    expect(result.errors.map((error) => error.code)).toContain('SOURCE_NOT_ANCESTOR');
  });

  it.each([
    ['unknown signing key', 'SIGNATURE_INVALID'],
    ['changed artifact bytes', 'ARTIFACT_HASH_MISMATCH'],
    ['changed evidence bytes', 'EVIDENCE_HASH_MISMATCH'],
    ['representative tree mismatch', 'TREE_HASH_MISMATCH'],
  ] as const)('%s returns %s', async (fixtureName, expectedCode) => {
    const manifest = signManifest(loadFixture());
    const repositories = {
      ...fixtureRepositories,
      ...(fixtureName === 'unknown signing key'
        ? { trustedKeys: { schemaVersion: 1, keys: [] } }
        : {}),
      ...(fixtureName.includes('bytes')
        ? {
            readFile: (path: string) => {
              if (fixtureName === 'changed artifact bytes' && path.endsWith('desktop.bin')) {
                return Buffer.from('changed');
              }
              if (fixtureName === 'changed evidence bytes' && path.endsWith('runtime.json')) {
                return Buffer.from('changed');
              }
              return fixtureRepositories.readFile(path);
            },
          }
        : {}),
      ...(fixtureName === 'representative tree mismatch'
        ? {
            repositories: {
              ...fixtureRepositories.repositories,
              representative: {
                ...fixtureRepositories.repositories.representative,
                treeHash: () => '0'.repeat(40),
              },
            },
          }
        : {}),
    };

    const result = await verifyReleaseManifest(manifest, repositories);
    expect(result.errors.map((error) => error.code)).toContain(expectedCode);
  });

  it('rejects unsupported Released state without evidence', async () => {
    const manifest = loadFixture();
    manifest.signedArtifacts = [];
    manifest.evidence = [];
    manifest.features[0] = {
      ...manifest.features[0],
      signedArtifactNames: [],
      evidenceIds: [],
    };

    const result = await verifyReleaseManifest(signManifest(manifest), fixtureRepositories);
    expect(result.errors.map((error) => error.code)).toContain('RELEASE_EVIDENCE_MISSING');
  });

  it('returns DR_PIN_MISSING when a Released DR feature is not pinned', async () => {
    const manifest = loadFixture();
    manifest.features[0] = {
      ...manifest.features[0],
      repository: 'representative',
      usesDigitalRepresentative: true,
      representativePins: null,
    };

    const result = await verifyReleaseManifest(signManifest(manifest), fixtureRepositories);
    expect(result.errors.map((error) => error.code)).toContain('DR_PIN_MISSING');
  });

  it('returns COMMERCE_ENABLED_BEFORE_SLICE_7 for early commerce enablement', async () => {
    const manifest = loadFixture();
    manifest.commerce = { newSalesEnabled: true, freezeEvidence: ['runtime-verification'] };

    const result = await verifyReleaseManifest(signManifest(manifest), fixtureRepositories);
    expect(result.errors.map((error) => error.code)).toContain(
      'COMMERCE_ENABLED_BEFORE_SLICE_7',
    );
  });
});

describe('evidence manifest generation', () => {
  it('hashes caller-supplied machine-readable outputs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'semblance-evidence-'));
    const verifyOutput = join(directory, 'verify.json');
    const dataAuditOutput = join(directory, 'data-audit.json');
    writeFileSync(verifyOutput, '{"buildReady":true}\n');
    writeFileSync(dataAuditOutput, '{"verdict":"healthy"}\n');

    const result = generateEvidenceManifest({ verifyOutput, dataAuditOutput });

    expect(result).toMatchObject({
      schemaVersion: 1,
      evidence: [
        { id: 'semblance-verify', path: verifyOutput },
        { id: 'data-audit', path: dataAuditOutput },
      ],
    });
    expect(result.evidence.every((item) => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true);
  });

  it('refuses a missing machine-readable output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'semblance-evidence-'));
    const verifyOutput = join(directory, 'verify.json');
    writeFileSync(verifyOutput, '{}');

    expect(() => generateEvidenceManifest({
      verifyOutput,
      dataAuditOutput: join(directory, 'missing.json'),
    })).toThrowError(expect.objectContaining({ code: 'EVIDENCE_FILE_MISSING' }));
  });
});

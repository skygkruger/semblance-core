import { beforeAll, describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { sign as signEd25519 } from '../../packages/core/crypto/ed25519.js';
import { initDesktopPlatform } from '../../packages/core/platform/index.js';
import currentManifest from '../../release/release-manifest.json';
import releaseManifestSchema from '../../release/release-manifest.schema.json';
import {
  canonicalizeReleaseManifest,
  validateReleaseManifest,
  verifyReleaseManifest,
  type ReleaseManifestV1,
  type TrustedReleaseKeysV1,
} from '../../packages/core/release/types.js';

const TEST_PRIVATE_KEY = Buffer.from(
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  'hex',
);
const TEST_PUBLIC_KEY = Buffer.from(
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  'hex',
);
const TEST_KEY_ID = 'test-release-key';
const TEST_PUBLIC_KEYS: TrustedReleaseKeysV1 = {
  schemaVersion: 1,
  keys: [{
    id: TEST_KEY_ID,
    algorithm: 'Ed25519',
    publicKey: TEST_PUBLIC_KEY.toString('base64'),
    validFrom: '2024-01-01T00:00:00.000Z',
    validUntil: '2030-01-01T00:00:00.000Z',
  }],
};

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

const validFixture: ReleaseManifestV1 = {
  schemaVersion: 1,
  releaseId: '2026.07.18-test',
  generatedAt: '2026-07-18T12:00:00.000Z',
  repositories: {
    core: { sourceCommit: '1'.repeat(40), sourceTreeHash: HASH_A },
    representative: {
      sourceCommit: '2'.repeat(40),
      sourceTreeHash: HASH_B,
      packageVersion: '1.0.0',
      artifactHash: null,
      extensionManifestHash: null,
    },
    website: { sourceCommit: '3'.repeat(40), sourceTreeHash: HASH_C },
  },
  signedArtifacts: [],
  evidence: [],
  commerce: { newSalesEnabled: false, freezeEvidence: [] },
  protocolVersions: { releaseEvidence: 1 },
  modelRuntimeHashes: [],
  confidentialWorkloadMeasurements: [],
  infrastructurePolicyVersions: [],
  legalNoticesVersion: '2026-07-18',
  completedSlices: [1],
  features: [{
    id: 'release-evidence-schema',
    name: 'Release evidence schema',
    repository: 'core',
    state: 'Implemented',
    usesDigitalRepresentative: false,
    signedArtifactNames: [],
    evidenceIds: [],
    protocolVersions: { releaseEvidence: 1 },
    modelRuntimeHashes: [],
    confidentialWorkloadMeasurements: [],
    infrastructurePolicyVersions: [],
    legalNoticesVersion: '2026-07-18',
    representativePins: null,
  }],
  signatureKeyId: TEST_KEY_ID,
  signature: '',
};

function signFixtureManifest(manifest: ReleaseManifestV1): ReleaseManifestV1 {
  const signature = signEd25519(
    Buffer.from(canonicalizeReleaseManifest(manifest), 'utf-8'),
    TEST_PRIVATE_KEY,
  );
  return { ...manifest, signature: Buffer.from(signature).toString('base64') };
}

function signText(value: string): string {
  return signEd25519(Buffer.from(value, 'utf-8'), TEST_PRIVATE_KEY).toString('base64');
}

describe('release manifest v1', () => {
  beforeAll(() => {
    initDesktopPlatform();
  });

  it('rejects Released evidence without artifact hash and evidence files', () => {
    const releasedWithoutArtifact: ReleaseManifestV1 = {
      ...validFixture,
      features: [{
        ...validFixture.features[0]!,
        state: 'Released',
      }],
    };

    const result = validateReleaseManifest(releasedWithoutArtifact);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('signed artifact'));
    expect(result.errors).toContainEqual(expect.stringContaining('evidence'));
  });

  it('publishes a JSON Schema that accepts the typed v1 fixture', () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validate = ajv.compile(releaseManifestSchema);

    expect(validate(validFixture), validate.errors?.map((error) => error.message).join(', ')).toBe(true);
  });

  it('keeps the checked-in truth baseline schema-valid and sales-frozen', () => {
    const result = validateReleaseManifest(currentManifest);

    expect(result).toEqual({ valid: true, errors: [] });
    expect(currentManifest.commerce.newSalesEnabled).toBe(false);
    expect(currentManifest.features.every((feature) => feature.state !== 'Released')).toBe(true);
  });

  it('requires new sales disabled before Slice 7 evidence exists', () => {
    const result = validateReleaseManifest({
      ...validFixture,
      commerce: { newSalesEnabled: true, freezeEvidence: [] },
      completedSlices: [1],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('Slice 7'));
  });

  it('verifies canonical manifest signature without self-reference', () => {
    const signed = signFixtureManifest(validFixture);

    expect(verifyReleaseManifest(signed, {
      trustedKeys: TEST_PUBLIC_KEYS,
      now: new Date('2026-07-18T12:00:00.000Z'),
    }).valid).toBe(true);
    expect(verifyReleaseManifest(
      { ...signed, legalNoticesVersion: 'tampered' },
      {
        trustedKeys: TEST_PUBLIC_KEYS,
        now: new Date('2026-07-18T12:00:00.000Z'),
      },
    ).valid).toBe(false);
  });

  it('rejects unknown and out-of-window signing keys', () => {
    const signed = signFixtureManifest(validFixture);

    expect(verifyReleaseManifest(signed, {
      trustedKeys: { schemaVersion: 1, keys: [] },
    }).errors).toContainEqual(expect.stringContaining('Unknown'));
    expect(verifyReleaseManifest(signed, {
      trustedKeys: TEST_PUBLIC_KEYS,
      now: new Date('2031-01-01T00:00:00.000Z'),
    }).errors).toContainEqual(expect.stringContaining('expired'));
  });

  it('verifies Released artifact and evidence hashes beneath supplied roots', () => {
    const artifactHash = 'd'.repeat(64);
    const evidenceHash = 'e'.repeat(64);
    const released = signFixtureManifest({
      ...validFixture,
      signedArtifacts: [{
        name: 'desktop-bundle',
        path: 'bundles/semblance.zip',
        sha256: artifactHash,
        signature: signText(artifactHash),
        signatureKeyId: TEST_KEY_ID,
      }],
      evidence: [{
        id: 'release-tests',
        repository: 'core',
        path: 'evidence/release-tests.txt',
        sha256: evidenceHash,
        requiredForStates: ['Released'],
      }],
      features: [{
        ...validFixture.features[0]!,
        state: 'Released',
        signedArtifactNames: ['desktop-bundle'],
        evidenceIds: ['release-tests'],
      }],
    });

    const result = verifyReleaseManifest(released, {
      trustedKeys: TEST_PUBLIC_KEYS,
      now: new Date('2026-07-18T12:00:00.000Z'),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path) => path.endsWith('semblance.zip') ? artifactHash : evidenceHash,
      sourceProvenance: {
        core: {
          headCommit: 'f'.repeat(40),
          isAncestor: () => true,
          treeHash: () => HASH_A,
        },
      },
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects malformed inputs instead of throwing', () => {
    expect(validateReleaseManifest({
      ...validFixture,
      signedArtifacts: [null],
    })).toEqual(expect.objectContaining({ valid: false }));
  });
});

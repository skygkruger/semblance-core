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
  type SourceProvenanceVerifier,
  type TrustedReleaseKeysV1,
  type VerifyReleaseManifestOptions,
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

function sourceProvenance(overrides?: {
  repository?: 'core' | 'representative' | 'website';
  ancestor?: boolean;
  treeHash?: string | null;
  throws?: boolean;
}): Record<'core' | 'representative' | 'website', SourceProvenanceVerifier> {
  const hashes = { core: HASH_A, representative: HASH_B, website: HASH_C };
  return Object.fromEntries(
    (['core', 'representative', 'website'] as const).map((repository) => [
      repository,
      {
        headCommit: 'f'.repeat(40),
        isAncestor: () => {
          if (overrides?.repository === repository && overrides.throws) throw new Error('git unavailable');
          return overrides?.repository === repository ? (overrides.ancestor ?? true) : true;
        },
        treeHash: () => (
          overrides?.repository === repository
            ? (overrides.treeHash ?? hashes[repository])
            : hashes[repository]
        ),
      },
    ]),
  ) as unknown as Record<'core' | 'representative' | 'website', SourceProvenanceVerifier>;
}

function verificationOptions() {
  return {
    trustedKeys: TEST_PUBLIC_KEYS,
    now: new Date('2026-07-18T12:00:00.000Z'),
    sourceProvenance: sourceProvenance(),
  };
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

  it('keeps the checked-in truth baseline schema-valid with Slice 7 sales enabled', () => {
    const result = validateReleaseManifest(currentManifest);

    expect(result).toEqual({ valid: true, errors: [] });
    expect(currentManifest.commerce.newSalesEnabled).toBe(true);
    expect(currentManifest.completedSlices).toContain(7);
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

    expect(verifyReleaseManifest(signed, verificationOptions()).valid).toBe(true);
    expect(verifyReleaseManifest(
      { ...signed, legalNoticesVersion: 'tampered' },
      verificationOptions(),
    ).valid).toBe(false);
  });

  it('rejects unknown and out-of-window signing keys', () => {
    const signed = signFixtureManifest(validFixture);

    expect(verifyReleaseManifest(signed, {
      trustedKeys: { schemaVersion: 1, keys: [] },
      sourceProvenance: sourceProvenance(),
    }).errors).toContainEqual(expect.stringContaining('Unknown'));
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
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
      resolveRealPath: (path) => path,
      sourceProvenance: sourceProvenance(),
    });

    expect(result).toEqual({ valid: true, errors: [] });

    const artifactReadFailure = verifyReleaseManifest(released, {
      trustedKeys: TEST_PUBLIC_KEYS,
      now: new Date('2026-07-18T12:00:00.000Z'),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path) => {
        if (path.endsWith('semblance.zip')) throw new Error('ENOENT');
        return evidenceHash;
      },
      resolveRealPath: (path) => path,
      sourceProvenance: sourceProvenance(),
    });
    expect(artifactReadFailure.errors).toContain(
      'Artifact desktop-bundle could not be hashed',
    );

    const evidenceReadFailure = verifyReleaseManifest(released, {
      trustedKeys: TEST_PUBLIC_KEYS,
      now: new Date('2026-07-18T12:00:00.000Z'),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path) => {
        if (path.endsWith('release-tests.txt')) throw new Error('EACCES');
        return artifactHash;
      },
      resolveRealPath: (path) => path,
      sourceProvenance: sourceProvenance(),
    });
    expect(evidenceReadFailure.errors).toContain(
      'Evidence release-tests could not be hashed',
    );
  });

  it('rejects malformed inputs instead of throwing', () => {
    expect(validateReleaseManifest({
      ...validFixture,
      signedArtifacts: [null],
    })).toEqual(expect.objectContaining({ valid: false }));
  });

  it('requires provenance verifiers for every repository', () => {
    const signed = signFixtureManifest(validFixture);

    expect(verifyReleaseManifest(signed, {
      trustedKeys: TEST_PUBLIC_KEYS,
    } as VerifyReleaseManifestOptions).errors).toContainEqual(
      expect.stringContaining('core provenance verifier'),
    );
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      sourceProvenance: sourceProvenance({ repository: 'core', ancestor: false }),
    }).errors).toContainEqual(expect.stringContaining('not an ancestor'));
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      sourceProvenance: sourceProvenance({ repository: 'website', treeHash: '0'.repeat(64) }),
    }).errors).toContainEqual(expect.stringContaining('tree'));
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      sourceProvenance: sourceProvenance({ repository: 'representative', throws: true }),
    }).errors).toContainEqual(expect.stringContaining('provenance verification failed'));
  });

  it('rejects not-yet-valid, malformed-date, and unsupported-algorithm keys', () => {
    const signed = signFixtureManifest(validFixture);
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      now: new Date('2020-01-01T00:00:00.000Z'),
    }).errors).toContainEqual(expect.stringContaining('not yet valid'));

    const malformed = {
      schemaVersion: 1 as const,
      keys: [{ ...TEST_PUBLIC_KEYS.keys[0]!, validFrom: 'not-a-date' }],
    };
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      trustedKeys: malformed,
    }).errors).toContainEqual(expect.stringContaining('validity'));

    const informalDates = {
      schemaVersion: 1 as const,
      keys: [{
        ...TEST_PUBLIC_KEYS.keys[0]!,
        validFrom: 'January 1, 2024',
        validUntil: 'January 1, 2030',
      }],
    };
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      trustedKeys: informalDates,
    }).errors).toContainEqual(expect.stringContaining('validity'));

    const reversedWindow = {
      schemaVersion: 1 as const,
      keys: [{
        ...TEST_PUBLIC_KEYS.keys[0]!,
        validFrom: '2030-01-01T00:00:00.000Z',
        validUntil: '2024-01-01T00:00:00.000Z',
      }],
    };
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      trustedKeys: reversedWindow,
    }).errors).toContainEqual(expect.stringContaining('window'));

    const unsupported = {
      schemaVersion: 1 as const,
      keys: [{ ...TEST_PUBLIC_KEYS.keys[0]!, algorithm: 'RSA' as 'Ed25519' }],
    };
    expect(verifyReleaseManifest(signed, {
      ...verificationOptions(),
      trustedKeys: unsupported,
    }).errors).toContainEqual(expect.stringContaining('algorithm'));
  });

  it('requires commerce evidence to name Released evidence and verifies its hash', () => {
    const commerceHash = '9'.repeat(64);
    const enabled = signFixtureManifest({
      ...validFixture,
      completedSlices: [1, 7],
      commerce: { newSalesEnabled: true, freezeEvidence: ['slice-7-commerce-freeze'] },
      evidence: [{
        id: 'slice-7-commerce-freeze',
        repository: 'website',
        path: 'evidence/commerce-freeze.json',
        sha256: commerceHash,
        requiredForStates: ['Released'],
      }],
    });

    expect(verifyReleaseManifest(enabled, {
      ...verificationOptions(),
      evidenceRoots: { website: '/tmp/website' },
      hashFile: () => commerceHash,
      resolveRealPath: (path) => path,
    })).toEqual({ valid: true, errors: [] });
    expect(validateReleaseManifest({
      ...enabled,
      commerce: { newSalesEnabled: true, freezeEvidence: ['arbitrary-string'] },
    }).errors).toContainEqual(expect.stringContaining('missing freeze evidence'));
    expect(validateReleaseManifest({
      ...validFixture,
      commerce: { newSalesEnabled: false, freezeEvidence: ['arbitrary-string'] },
    }).errors).toContainEqual(expect.stringContaining('missing freeze evidence'));
    expect(verifyReleaseManifest(enabled, {
      ...verificationOptions(),
      evidenceRoots: { website: '/tmp/website' },
      hashFile: () => '0'.repeat(64),
      resolveRealPath: (path) => path,
    }).errors).toContainEqual(expect.stringContaining('hash does not match'));
  });

  it('rejects a symlink-resolved artifact path outside its real root', () => {
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
      ...verificationOptions(),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path) => path.endsWith('semblance.zip') ? artifactHash : evidenceHash,
      resolveRealPath: (path) => path.endsWith('semblance.zip') ? '/tmp/outside/semblance.zip' : path,
    });

    expect(result.errors).toContainEqual(expect.stringContaining('real path escapes'));

    const traversing = signFixtureManifest({
      ...released,
      signedArtifacts: [{
        ...released.signedArtifacts[0]!,
        path: '../outside/semblance.zip',
      }],
    });
    expect(verifyReleaseManifest(traversing, {
      ...verificationOptions(),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path) => path.endsWith('semblance.zip') ? artifactHash : evidenceHash,
      resolveRealPath: (path) => path,
    }).errors).toContainEqual(expect.stringContaining('artifact root'));

    expect(verifyReleaseManifest(released, {
      ...verificationOptions(),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path) => path.endsWith('semblance.zip') ? artifactHash : evidenceHash,
      resolveRealPath: () => {
        throw new Error('realpath unavailable');
      },
    }).errors).toContainEqual(expect.stringContaining('could not be resolved'));
  });

  it('enforces FieldProven evidence and policy pin matching', () => {
    const artifactHash = 'd'.repeat(64);
    const evidenceHash = 'e'.repeat(64);
    const fieldProven = signFixtureManifest({
      ...validFixture,
      signedArtifacts: [{
        name: 'desktop-bundle',
        path: 'bundle.zip',
        sha256: artifactHash,
        signature: signText(artifactHash),
        signatureKeyId: TEST_KEY_ID,
      }],
      evidence: [{
        id: 'field-proof',
        repository: 'core',
        path: 'field-proof.json',
        sha256: evidenceHash,
        requiredForStates: ['FieldProven'],
      }],
      features: [{
        ...validFixture.features[0]!,
        state: 'FieldProven',
        signedArtifactNames: ['desktop-bundle'],
        evidenceIds: ['field-proof'],
      }],
    });
    const options = {
      ...verificationOptions(),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { core: '/tmp/core' },
      hashFile: (path: string) => path.endsWith('.zip') ? artifactHash : evidenceHash,
      resolveRealPath: (path: string) => path,
    };

    expect(verifyReleaseManifest(fieldProven, options)).toEqual({ valid: true, errors: [] });
    for (const featurePatch of [
      { protocolVersions: { releaseEvidence: 2 } },
      { modelRuntimeHashes: ['0'.repeat(64)] },
      { confidentialWorkloadMeasurements: ['measurement'] },
      { infrastructurePolicyVersions: ['policy-v2'] },
      { legalNoticesVersion: 'wrong' },
    ]) {
      const result = validateReleaseManifest({
        ...fieldProven,
        features: [{ ...fieldProven.features[0]!, ...featurePatch }],
      });
      expect(result.valid).toBe(false);
    }
  });

  it('binds DR pins to referenced and verified artifact/evidence records', () => {
    const drHash = '4'.repeat(64);
    const extensionHash = '5'.repeat(64);
    const drRelease = signFixtureManifest({
      ...validFixture,
      repositories: {
        ...validFixture.repositories,
        representative: {
          ...validFixture.repositories.representative,
          artifactHash: drHash,
          extensionManifestHash: extensionHash,
        },
      },
      signedArtifacts: [{
        name: 'dr-package',
        path: 'dr.tgz',
        sha256: drHash,
        signature: signText(drHash),
        signatureKeyId: TEST_KEY_ID,
      }],
      evidence: [{
        id: 'dr-extension-manifest',
        repository: 'representative',
        path: 'extension-manifest.json',
        sha256: extensionHash,
        requiredForStates: ['Released'],
      }],
      features: [{
        ...validFixture.features[0]!,
        repository: 'representative',
        state: 'Released',
        usesDigitalRepresentative: true,
        signedArtifactNames: ['dr-package'],
        evidenceIds: ['dr-extension-manifest'],
        representativePins: {
          packageVersion: '1.0.0',
          artifactHash: drHash,
          extensionManifestHash: extensionHash,
        },
      }],
    });
    const options = {
      ...verificationOptions(),
      artifactRoot: '/tmp/artifacts',
      evidenceRoots: { representative: '/tmp/representative' },
      hashFile: (path: string) => path.endsWith('.tgz') ? drHash : extensionHash,
      resolveRealPath: (path: string) => path,
    };

    expect(verifyReleaseManifest(drRelease, options)).toEqual({ valid: true, errors: [] });
    const unbound = {
      ...drRelease,
      evidence: [{
        ...drRelease.evidence[0]!,
        sha256: '6'.repeat(64),
      }],
    };
    expect(validateReleaseManifest(unbound).errors).toContainEqual(
      expect.stringContaining('extension manifest pin'),
    );
    const unboundPackage = {
      ...drRelease,
      signedArtifacts: [{
        ...drRelease.signedArtifacts[0]!,
        sha256: '6'.repeat(64),
      }],
    };
    expect(validateReleaseManifest(unboundPackage).errors).toContainEqual(
      expect.stringContaining('DR artifact pin'),
    );
  });

  it('keeps runtime structural acceptance in parity with JSON Schema', () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validateSchema = ajv.compile(releaseManifestSchema);
    const cases: unknown[] = [
      validFixture,
      { ...validFixture, unexpected: true },
      { ...validFixture, completedSlices: [1, 1] },
      { ...validFixture, modelRuntimeHashes: [''] },
      { ...validFixture, infrastructurePolicyVersions: ['v1', 'v1'] },
      { ...validFixture, commerce: { ...validFixture.commerce, unexpected: true } },
      { ...validFixture, features: [validFixture.features[0]!, validFixture.features[0]!] },
      {
        ...validFixture,
        evidence: [{
          id: 'empty-states',
          repository: 'core',
          path: 'evidence.json',
          sha256: '8'.repeat(64),
          requiredForStates: [],
        }],
      },
      {
        ...validFixture,
        features: [{ ...validFixture.features[0]!, unexpected: true }],
      },
      {
        ...validFixture,
        features: [{
          ...validFixture.features[0]!,
          usesDigitalRepresentative: true,
          representativePins: { packageVersion: '1.0.0' },
        }],
      },
    ];

    for (const candidate of cases) {
      expect(
        validateReleaseManifest(candidate).valid,
        JSON.stringify(candidate),
      ).toBe(validateSchema(candidate));
    }
  });

  it('matches JSON Schema RFC 3339 date-time validation for generatedAt', () => {
    const ajv = new Ajv2020({ strict: true });
    addFormats(ajv);
    const validateSchema = ajv.compile(releaseManifestSchema);
    const timestamps = [
      '2026-07-18T17:05:00.000Z',
      '2024-02-29t23:59:59+05:30',
      '1990-12-31T23:59:60Z',
      '2026-07-18 17:05:00-04',
      'July 18, 2026',
      '2026-02-29T17:05:00Z',
      '2026-07-18T17:05:00',
      '2026-07-18T24:00:00Z',
      '2026-07-18T17:05:00+24:00',
    ];

    for (const generatedAt of timestamps) {
      const candidate = { ...validFixture, generatedAt };
      expect(
        validateReleaseManifest(candidate).valid,
        generatedAt,
      ).toBe(validateSchema(candidate));
    }
    expect(validateReleaseManifest({
      ...validFixture,
      generatedAt: 'July 18, 2026',
    }).valid).toBe(false);
  });
});

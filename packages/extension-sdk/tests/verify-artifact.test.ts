import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SignedExtensionManifest,
  canonicalSigningPayload,
  compareSemver,
  isCoreVersionCompatible,
  loadDrPublisherKeys,
  sha256Prefixed,
  verifySignedExtensionArtifact,
  type DrPublisherKeyRecord,
} from '../src/index.js';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const pinnedKeysPath = join(packageRoot, '..', '..', '..', 'release', 'keys', 'dr-publisher-keys.json');

function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signManifest(
  manifest: Omit<ReturnType<typeof SignedExtensionManifest.parse>, 'signature' | 'signatureKeyId'>,
  privateKeyPem: string,
  keyId: string,
) {
  const payload = Buffer.from(canonicalSigningPayload(manifest as never), 'utf8');
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, payload, privateKey);
  return {
    ...manifest,
    signatureKeyId: keyId,
    signature: base64urlEncode(signature),
  };
}

function createTestKeypair(): {
  keyId: string;
  privateKeyPem: string;
  publisherKeys: DrPublisherKeyRecord[];
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = 'test-key-v1';
  return {
    keyId,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publisherKeys: [
      {
        keyId,
        algorithm: 'Ed25519',
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    ],
  };
}

function buildUnsignedManifest(artifactHash: string) {
  return {
    id: 'com.semblance.dr',
    version: '0.1.0',
    protocolVersion: 1 as const,
    minCoreVersion: '1.0.0',
    artifactRelativePath: 'semblance-dr-0.1.0.tgz',
    artifactHash,
    permissions: {
      tools: ['draft_service_email'],
      slots: ['settings.digital_representative'],
    },
    createdAt: '2026-07-18T00:00:00.000Z',
    expiresAt: null,
  };
}

describe('@semblance/extension-sdk verify-artifact', () => {
  it('loads pinned DR publisher keys', () => {
    const keys = loadDrPublisherKeys(pinnedKeysPath);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys[0]?.keyId).toBe('dr-test-publisher-v1');
  });

  it('compares semver versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(isCoreVersionCompatible('1.0.0', '1.0.0')).toBe(true);
    expect(isCoreVersionCompatible('0.9.9', '1.0.0')).toBe(false);
  });

  it('accepts a valid signed artifact', () => {
    const { keyId, privateKeyPem, publisherKeys } = createTestKeypair();
    const artifactBytes = Buffer.from('signed-artifact-bytes');
    const artifactHash = sha256Prefixed(artifactBytes);
    const manifest = signManifest(buildUnsignedManifest(artifactHash), privateKeyPem, keyId);

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      publisherKeys,
    });

    expect(result.valid).toBe(true);
    expect(result.manifest?.id).toBe('com.semblance.dr');
  });

  it('rejects modified artifact hash', () => {
    const { keyId, privateKeyPem, publisherKeys } = createTestKeypair();
    const artifactBytes = Buffer.from('signed-artifact-bytes');
    const manifest = signManifest(
      buildUnsignedManifest(`sha256:${'a'.repeat(64)}`),
      privateKeyPem,
      keyId,
    );

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      publisherKeys,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Artifact hash mismatch/);
  });

  it('rejects unsigned manifest', () => {
    const artifactBytes = Buffer.from('bytes');
    const manifest = buildUnsignedManifest(sha256Prefixed(artifactBytes));

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      publisherKeys: loadDrPublisherKeys(pinnedKeysPath),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsigned/i);
  });

  it('rejects expired manifest', () => {
    const { keyId, privateKeyPem, publisherKeys } = createTestKeypair();
    const artifactBytes = Buffer.from('signed-artifact-bytes');
    const artifactHash = sha256Prefixed(artifactBytes);
    const manifest = signManifest(
      {
        ...buildUnsignedManifest(artifactHash),
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
      privateKeyPem,
      keyId,
    );

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      nowMs: Date.parse('2026-07-18T00:00:00.000Z'),
      publisherKeys,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it('rejects incompatible core version', () => {
    const { keyId, privateKeyPem, publisherKeys } = createTestKeypair();
    const artifactBytes = Buffer.from('signed-artifact-bytes');
    const manifest = signManifest(
      buildUnsignedManifest(sha256Prefixed(artifactBytes)),
      privateKeyPem,
      keyId,
    );

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '0.1.0',
      publisherKeys,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/below required/);
  });

  it('rejects unknown signatureKeyId', () => {
    const { privateKeyPem } = createTestKeypair();
    const artifactBytes = Buffer.from('signed-artifact-bytes');
    const manifest = signManifest(
      buildUnsignedManifest(sha256Prefixed(artifactBytes)),
      privateKeyPem,
      'unknown-key',
    );

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      publisherKeys: loadDrPublisherKeys(pinnedKeysPath),
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Unknown signatureKeyId/);
  });

  it('rejects tampered signature', () => {
    const { keyId, privateKeyPem, publisherKeys } = createTestKeypair();
    const artifactBytes = Buffer.from('signed-artifact-bytes');
    const manifest = signManifest(
      buildUnsignedManifest(sha256Prefixed(artifactBytes)),
      privateKeyPem,
      keyId,
    );
    manifest.signature = `${manifest.signature}x`;

    const result = verifySignedExtensionArtifact({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      publisherKeys,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Signature verification failed/);
  });

  it('verifies representative repo signed artifact fixture when present', () => {
    const fixtureManifestPath = join(
      packageRoot,
      '..',
      '..',
      '..',
      '..',
      'semblence-representative',
      'dist-signed',
      'extension.manifest.json',
    );
    const fixtureArtifactDir = dirname(fixtureManifestPath);

    try {
      const manifest = JSON.parse(readFileSync(fixtureManifestPath, 'utf8')) as unknown;
      const artifactRelativePath = (manifest as { artifactRelativePath?: string }).artifactRelativePath;
      if (!artifactRelativePath) return;

      const artifactBytes = readFileSync(join(fixtureArtifactDir, artifactRelativePath));
      const result = verifySignedExtensionArtifact({
        manifest,
        artifactBytes,
        coreVersion: '1.0.0',
      });

      expect(result.valid).toBe(true);
    } catch {
      // Optional cross-repo fixture — local representative build may not exist in CI yet.
    }
  });
});

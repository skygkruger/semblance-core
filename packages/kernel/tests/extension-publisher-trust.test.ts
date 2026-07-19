import { createPrivateKey, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  canonicalSigningPayload,
  loadDrPublisherKeys,
  sha256Prefixed,
  type DrPublisherKeyRecord,
  type SignedExtensionManifest,
} from '@semblance/extension-sdk';
import {
  createExtensionPublisherTrustStore,
  createExtensionRevocationStore,
  createKernelExtensionTrustChecker,
  evaluateExtensionPublisherTrust,
  isApiRangeAllowedForTrustLevel,
} from '../src/index.js';
import { ExtensionPublisherTrustStore } from '../src/extension/trust-store.js';
import { evaluateRevocationLoadPolicy } from '../src/extension/revocation.js';

const fixturesRoot = join(import.meta.dirname, '..', '..', 'extension-runner', 'fixtures');

function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function loadTestPublisherKey(): {
  keyId: string;
  privateKeyPem: string;
  publisherKeys: DrPublisherKeyRecord[];
} {
  const raw = JSON.parse(
    readFileSync(join(fixturesRoot, 'test-publisher.private.json'), 'utf8'),
  ) as { keyId: string; privateKeyPem: string };
  const pinnedPublic = readFileSync(
    join(fixturesRoot, '..', '..', '..', 'release', 'keys', 'dr-publisher-keys.json'),
    'utf8',
  );
  const publisherKeys = (JSON.parse(pinnedPublic) as { keys: DrPublisherKeyRecord[] }).keys;
  return {
    keyId: raw.keyId,
    privateKeyPem: raw.privateKeyPem,
    publisherKeys,
  };
}

function signManifest(unsigned: Omit<SignedExtensionManifest, 'signatureKeyId' | 'signature'>): SignedExtensionManifest {
  const { keyId, privateKeyPem } = loadTestPublisherKey();
  const payload = Buffer.from(canonicalSigningPayload(unsigned as never), 'utf8');
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, payload, privateKey);
  return {
    ...unsigned,
    signatureKeyId: keyId,
    signature: base64urlEncode(signature),
  };
}

function createSignedArtifact(options?: {
  platformApi?: string;
  artifactBytes?: Buffer;
}): { manifest: SignedExtensionManifest; artifactBytes: Buffer } {
  const artifactBytes = options?.artifactBytes ?? Buffer.from('signed-extension-payload');
  const unsigned = {
    id: 'com.semblance.dr',
    version: '0.1.0',
    protocolVersion: 1 as const,
    minCoreVersion: '1.0.0',
    artifactRelativePath: 'artifact.tgz',
    artifactHash: sha256Prefixed(artifactBytes),
    permissions: {
      tools: ['draft_service_email'],
      slots: ['settings.digital_representative'],
    },
    createdAt: '2026-07-18T00:00:00.000Z',
    expiresAt: null,
    ...(options?.platformApi ? { platformApi: options.platformApi } : {}),
  };
  return {
    manifest: signManifest(unsigned),
    artifactBytes,
  };
}

describe('extension publisher trust store', () => {
  it('bootstraps built-in publishers from pinned keys', () => {
    const store = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
    const publishers = store.listPublishers();
    expect(publishers.some((entry) => entry.trustLevel === 'built-in')).toBe(true);
    expect(store.getPublisherByKeyId('dr-test-publisher-v1')?.trustLevel).toBe('built-in');
  });

  it('persists user-trusted publishers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'semblance-trust-'));
    const filePath = join(dir, 'extension-publisher-trust.json');
    try {
      const store = ExtensionPublisherTrustStore.fromFile(filePath);
      store.trustPublisher({
        publisherId: 'com.example.dev',
        displayName: 'Example Dev',
        keyId: 'example-dev-v1',
        publicKeyPem: loadTestPublisherKey().publisherKeys[0]!.publicKeyPem,
        trustLevel: 'user-trusted',
      });
      writeFileSync(filePath, `${JSON.stringify(store.getDocument(), null, 2)}\n`, 'utf8');
      const reloaded = ExtensionPublisherTrustStore.fromFile(filePath);
      expect(reloaded.getPublisherByKeyId('example-dev-v1')?.trustLevel).toBe('user-trusted');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extension publisher policy', () => {
  let trustStore: ExtensionPublisherTrustStore;
  let revocationStore: ReturnType<typeof createExtensionRevocationStore>;

  beforeEach(() => {
    trustStore = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
    revocationStore = createExtensionRevocationStore();
  });

  it('accepts valid built-in signed artifacts', () => {
    const { manifest, artifactBytes } = createSignedArtifact();
    const evaluation = evaluateExtensionPublisherTrust(trustStore, revocationStore, {
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
    });
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.trustLevel).toBe('built-in');
  });

  it('rejects bad signatures', () => {
    const { manifest, artifactBytes } = createSignedArtifact();
    const evaluation = evaluateExtensionPublisherTrust(trustStore, revocationStore, {
      manifest: { ...manifest, signature: 'bad-signature' },
      artifactBytes,
      coreVersion: '1.0.0',
    });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toMatch(/Signature/i);
  });

  it('rejects API ranges outside user-trusted policy', () => {
    expect(isApiRangeAllowedForTrustLevel('user-trusted', ['2026-07-18'])).toBe(false);
    expect(isApiRangeAllowedForTrustLevel('organization-trusted', ['2026-07-18'])).toBe(true);
    expect(isApiRangeAllowedForTrustLevel('built-in', ['2099-01-01'])).toBe(true);
  });

  it('quarantines revoked marketplace publishers', () => {
    const { manifest, artifactBytes } = createSignedArtifact();
    revocationStore.revokePublisher({
      publisherKeyId: manifest.signatureKeyId,
      reason: 'Publisher certificate compromised',
    });

    const evaluation = evaluateExtensionPublisherTrust(trustStore, revocationStore, {
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      ownership: 'marketplace',
    });
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.quarantined).toBe(true);
    expect(evaluation.reason).toMatch(/compromised/i);
  });

  it('allows revoked publisher for offline user-local with degraded policy', () => {
    const { manifest, artifactBytes } = createSignedArtifact();
    revocationStore.revokePublisher({
      publisherKeyId: manifest.signatureKeyId,
      reason: 'Publisher certificate compromised',
    });

    const degraded = evaluateRevocationLoadPolicy(revocationStore.getDocument(), {
      publisherKeyId: manifest.signatureKeyId,
      manifestId: manifest.id,
      artifactHash: manifest.artifactHash,
      ownership: 'user-local',
    });
    expect(degraded.action).toBe('degraded');
    expect(degraded.degradedPolicy).toBe(true);

    const evaluation = evaluateExtensionPublisherTrust(trustStore, revocationStore, {
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
      ownership: 'user-local',
    });
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.degradedPolicy).toBe(true);
    expect(evaluation.quarantined).toBe(false);
  });

  it('exposes kernel trust checker compatible with extension runner', () => {
    const checker = createKernelExtensionTrustChecker(trustStore, revocationStore);
    const { manifest, artifactBytes } = createSignedArtifact();
    const result = checker.checkTrust({
      manifest,
      artifactBytes,
      coreVersion: '1.0.0',
    });
    expect(result.allowed).toBe(true);
  });
});

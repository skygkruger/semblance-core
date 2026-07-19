import { createPrivateKey, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  ExtensionInstallStore,
  createExtensionPublisherTrustStore,
  createExtensionRevocationStore,
  createKernelExtensionTrustChecker,
  validateExplicitInstallGrant,
  extractRequestedPermissions,
  narrowGrantedPermissions,
} from '../src/index.js';

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
  return { ...raw, publisherKeys };
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

function writeSignedFixture(dir: string): { manifestPath: string; artifactPath: string; manifest: SignedExtensionManifest } {
  const artifactPath = join(dir, 'artifact.tgz');
  const artifactBytes = Buffer.from('signed-extension-payload');
  const fs = require('node:fs') as typeof import('node:fs');
  fs.writeFileSync(artifactPath, artifactBytes);
  const unsigned = {
    id: 'com.example.capability',
    version: '0.1.0',
    protocolVersion: 1 as const,
    minCoreVersion: '1.0.0',
    artifactRelativePath: 'artifact.tgz',
    artifactHash: sha256Prefixed(artifactBytes),
    permissions: {
      tools: ['draft_service_email', 'calendar_plan'],
      slots: ['settings.capabilities'],
    },
    createdAt: '2026-07-18T00:00:00.000Z',
    expiresAt: null,
  };
  const manifest = signManifest(unsigned);
  const manifestPath = join(dir, 'extension.manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifestPath, artifactPath, manifest };
}

describe('extension permission grants', () => {
  it('requires explicit granted permissions on install', () => {
    const requested = extractRequestedPermissions({
      permissions: { tools: ['a'], slots: ['settings'] },
    });
    expect(validateExplicitInstallGrant(requested, null).ok).toBe(false);
    expect(validateExplicitInstallGrant(requested, {
      dataCapabilities: [],
      actionCapabilities: [],
      networkDestinations: [],
      tools: [],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    }).ok).toBe(false);
    expect(validateExplicitInstallGrant(requested, {
      dataCapabilities: [],
      actionCapabilities: [],
      networkDestinations: [],
      tools: ['a'],
      insightTypes: [],
      uiSlots: ['settings'],
      schedules: [],
      entitlement: null,
    }).ok).toBe(true);
  });

  it('rejects grants that exceed requested manifest permissions', () => {
    const requested = extractRequestedPermissions({
      permissions: { tools: ['a'], slots: [] },
    });
    const overGrant = {
      dataCapabilities: [],
      actionCapabilities: [],
      networkDestinations: [],
      tools: ['a', 'extra'],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    };
    expect(validateExplicitInstallGrant(requested, overGrant).ok).toBe(false);
  });

  it('allows permission narrowing but not expansion', () => {
    const requested = extractRequestedPermissions({
      permissions: { tools: ['a', 'b'], slots: ['settings'] },
    });
    const current = {
      dataCapabilities: [],
      actionCapabilities: [],
      networkDestinations: [],
      tools: ['a', 'b'],
      insightTypes: [],
      uiSlots: ['settings'],
      schedules: [],
      entitlement: null,
    };
    const narrowed = {
      ...current,
      tools: ['a'],
    };
    expect(narrowGrantedPermissions(current, narrowed, requested).ok).toBe(true);
    expect(
      narrowGrantedPermissions(current, { ...current, tools: ['a', 'b', 'c'] }, requested).ok,
    ).toBe(false);
  });
});

describe('ExtensionInstallStore', () => {
  let dir: string;
  let store: ExtensionInstallStore;
  let trustChecker: ReturnType<typeof createKernelExtensionTrustChecker>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'semblance-ext-install-'));
    store = new ExtensionInstallStore(
      join(dir, 'extension-installs.json'),
      join(dir, 'installed'),
      join(dir, 'catalog'),
    );
    trustChecker = createKernelExtensionTrustChecker(
      createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys()),
      createExtensionRevocationStore(),
    );
  });

  it('installs with explicit grant and persists record', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'semblance-ext-fixture-'));
    const { manifestPath, artifactPath, manifest } = writeSignedFixture(fixtureDir);
    const requested = extractRequestedPermissions(manifest);
    const result = store.install({
      manifestPath,
      artifactPath,
      grantedPermissions: {
        ...requested,
        tools: ['draft_service_email'],
        uiSlots: ['settings.capabilities'],
      },
      trustChecker,
      installsRoot: join(dir, 'installed'),
      catalogRoot: join(dir, 'catalog'),
    });
    expect(result.success).toBe(true);
    expect(store.listInstalled()).toHaveLength(1);
    expect(store.get('com.example.capability')?.grantedPermissions.tools).toEqual(['draft_service_email']);
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('rejects install without explicit grant payload', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'semblance-ext-fixture-'));
    const { manifestPath, artifactPath, manifest } = writeSignedFixture(fixtureDir);
    const requested = extractRequestedPermissions(manifest);
    const result = store.install({
      manifestPath,
      artifactPath,
      grantedPermissions: {
        ...requested,
        tools: [],
        uiSlots: [],
      },
      trustChecker,
      installsRoot: join(dir, 'installed'),
      catalogRoot: join(dir, 'catalog'),
    });
    expect(result.success).toBe(false);
    rmSync(fixtureDir, { recursive: true, force: true });
  });
});

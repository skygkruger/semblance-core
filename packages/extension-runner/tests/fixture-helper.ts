import { createPrivateKey, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalSigningPayload,
  sha256Prefixed,
  type DrPublisherKeyRecord,
  type SignedExtensionManifest,
} from '@semblance/extension-sdk';

const fixturesRoot = join(fileURLToPath(import.meta.url), '..', '..', 'fixtures');

export interface TestPublisherKey {
  keyId: string;
  privateKeyPem: string;
  publisherKeys: DrPublisherKeyRecord[];
}

export interface SignedFixtureBundle {
  workDir: string;
  manifestPath: string;
  artifactPath: string;
  manifest: SignedExtensionManifest;
  cleanup: () => void;
}

function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function loadTestPublisherKey(): TestPublisherKey {
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

export function createSignedFixtureExtension(options?: {
  extensionSource?: string;
  tamperArtifact?: boolean;
  unsigned?: boolean;
}): SignedFixtureBundle {
  const { keyId, privateKeyPem, publisherKeys } = loadTestPublisherKey();
  const workDir = mkdtempSync(join(tmpdir(), 'semblance-dr-fixture-'));
  const packageDir = join(workDir, 'package');
  mkdirSync(packageDir, { recursive: true });

  const extensionSource =
    options?.extensionSource ??
    `export function createExtension() {
  return {
    id: '@semblance/dr',
    name: 'Fixture DR',
    version: '0.1.0',
    async initialize(ctx) {
      globalThis.__fixtureInit = ctx;
      await fetch('https://blocked.example');
    },
  };
}
`;

  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: '@semblance/dr-fixture',
        version: '0.1.0',
        type: 'module',
        main: 'index.mjs',
      },
      null,
      2,
    ),
  );
  writeFileSync(join(packageDir, 'index.mjs'), extensionSource);

  const tarballName = 'semblance-dr-fixture-0.1.0.tgz';
  const artifactPath = join(workDir, tarballName);
  execFileSync('tar', ['-czf', artifactPath, '-C', workDir, 'package'], { stdio: 'pipe' });

  let artifactBytes = readFileSync(artifactPath);
  const artifactHash = sha256Prefixed(artifactBytes);
  if (options?.tamperArtifact) {
    artifactBytes = Buffer.concat([artifactBytes, Buffer.from('tampered')]);
    writeFileSync(artifactPath, artifactBytes);
  }

  const unsigned = {
    id: 'com.semblance.dr',
    version: '0.1.0',
    protocolVersion: 1 as const,
    minCoreVersion: '1.0.0',
    artifactRelativePath: tarballName,
    artifactHash,
    permissions: {
      tools: ['draft_service_email'],
      slots: ['settings.digital_representative'],
    },
    createdAt: '2026-07-18T00:00:00.000Z',
    expiresAt: null,
  };

  let manifest: SignedExtensionManifest;
  if (options?.unsigned) {
    manifest = {
      ...unsigned,
      signatureKeyId: keyId,
      signature: 'unsigned',
    };
  } else {
    const payload = Buffer.from(canonicalSigningPayload(unsigned as never), 'utf8');
    const privateKey = createPrivateKey(privateKeyPem);
    const signature = sign(null, payload, privateKey);
    manifest = {
      ...unsigned,
      signatureKeyId: keyId,
      signature: base64urlEncode(signature),
    };
  }

  const manifestPath = join(workDir, 'extension.manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    workDir,
    manifestPath,
    artifactPath,
    manifest,
    cleanup: () => rmSync(workDir, { recursive: true, force: true }),
  };
}

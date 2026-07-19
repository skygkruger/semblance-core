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

const fixturesRoot = join(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  '..',
  'packages',
  'extension-runner',
  'fixtures',
);

export const THIRD_PARTY_MANIFEST_ID = 'com.example.conformance.demo';

export interface ThirdPartyPermissionManifest {
  dataCapabilities?: string[];
  actionCapabilities?: string[];
  networkDestinations?: string[];
  tools?: string[];
  uiSlots?: string[];
  schedules?: string[];
  migration?: {
    schemaVersion: number;
    uninstall: 'delete' | 'retain_user_data' | 'ask';
  };
}

export interface ThirdPartyFixtureBundle {
  workDir: string;
  manifestPath: string;
  artifactPath: string;
  manifest: SignedExtensionManifest & Record<string, unknown>;
  cleanup: () => void;
}

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

const DEFAULT_COMPLIANT_SOURCE = `export function createExtension() {
  return {
    id: '${THIRD_PARTY_MANIFEST_ID}',
    name: 'Conformance Demo',
    version: '1.0.0',
    async initialize(ctx) {
      globalThis.__conformanceInit = ctx;
    },
  };
}
`;

export function createThirdPartyConformanceFixture(options?: {
  extensionSource?: string;
  permissions?: ThirdPartyPermissionManifest;
  tamperArtifact?: boolean;
  unsigned?: boolean;
}): ThirdPartyFixtureBundle {
  const { keyId, privateKeyPem, publisherKeys: _publisherKeys } = loadTestPublisherKey();
  const workDir = mkdtempSync(join(tmpdir(), 'semblance-third-party-fixture-'));
  const packageDir = join(workDir, 'package');
  mkdirSync(packageDir, { recursive: true });

  const permissions = options?.permissions ?? {
    dataCapabilities: ['email.read'],
    actionCapabilities: ['email.send'],
    networkDestinations: ['api.google.com'],
    tools: ['summarize_inbox'],
    uiSlots: ['settings.capabilities'],
    schedules: ['daily_digest'],
    migration: { schemaVersion: 1, uninstall: 'retain_user_data' as const },
  };

  const extensionSource = options?.extensionSource ?? DEFAULT_COMPLIANT_SOURCE;
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify(
      {
        name: '@example/conformance-demo',
        version: '1.0.0',
        type: 'module',
        main: 'index.mjs',
      },
      null,
      2,
    ),
  );
  writeFileSync(join(packageDir, 'index.mjs'), extensionSource);

  const tarballName = 'conformance-demo-1.0.0.tgz';
  const artifactPath = join(workDir, tarballName);
  execFileSync('tar', ['-czf', artifactPath, '-C', workDir, 'package'], { stdio: 'pipe' });

  let artifactBytes = readFileSync(artifactPath);
  const artifactHash = sha256Prefixed(artifactBytes);
  if (options?.tamperArtifact) {
    artifactBytes = Buffer.concat([artifactBytes, Buffer.from('tampered')]);
    writeFileSync(artifactPath, artifactBytes);
  }

  const unsigned = {
    id: THIRD_PARTY_MANIFEST_ID,
    version: '1.0.0',
    protocolVersion: 1 as const,
    minCoreVersion: '1.0.0',
    artifactRelativePath: tarballName,
    artifactHash,
    permissions: {
      tools: permissions.tools ?? ['summarize_inbox'],
      slots: permissions.uiSlots ?? ['settings.capabilities'],
    },
    ...(permissions.migration ? { migration: permissions.migration } : {}),
    createdAt: '2026-07-19T00:00:00.000Z',
    expiresAt: null,
  };

  let manifest: SignedExtensionManifest & Record<string, unknown>;
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

export function grantedPermissionsFromManifest(
  manifest: ThirdPartyPermissionManifest,
  subset?: Partial<ThirdPartyPermissionManifest>,
): {
  dataCapabilities: string[];
  actionCapabilities: string[];
  networkDestinations: string[];
  tools: string[];
  insightTypes: string[];
  uiSlots: string[];
  schedules: string[];
  entitlement: string | null;
} {
  return {
    dataCapabilities: subset?.dataCapabilities ?? manifest.dataCapabilities ?? [],
    actionCapabilities: subset?.actionCapabilities ?? manifest.actionCapabilities ?? [],
    networkDestinations: subset?.networkDestinations ?? manifest.networkDestinations ?? [],
    tools: subset?.tools ?? manifest.tools ?? ['summarize_inbox'],
    insightTypes: [],
    uiSlots: subset?.uiSlots ?? manifest.uiSlots ?? ['settings.capabilities'],
    schedules: subset?.schedules ?? manifest.schedules ?? [],
    entitlement: null,
  };
}

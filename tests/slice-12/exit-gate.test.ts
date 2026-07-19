import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import * as extensionSdk from '@semblance/extension-sdk';
import {
  assertSdkSurfaceNoRawHandles,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  loadSignedDigitalRepresentative,
} from '@semblance/extension-runner';
import {
  createExtensionInstallStore,
  createExtensionPublisherTrustStore,
  createExtensionRevocationStore,
  createKernelExtensionTrustChecker,
  extractRequestedPermissions,
} from '@semblance/kernel';
import { loadDrPublisherKeys } from '@semblance/extension-sdk';
import {
  createThirdPartyConformanceFixture,
  grantedPermissionsFromManifest,
  THIRD_PARTY_MANIFEST_ID,
} from '../extension-conformance/fixtures/third-party-fixture.js';

describe('Slice 12 exit gate — signed capability ecosystem', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('sample third-party extension passes conformance load', async () => {
    const fixture = createThirdPartyConformanceFixture();
    try {
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        clients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient({
            active: false,
            tier: 'free',
            validUntil: null,
            seat: null,
          }),
        },
        grantedPermissions: granted,
      });
      expect(result.ok).toBe(true);
      expect(result.manifestId).toBe(THIRD_PARTY_MANIFEST_ID);
    } finally {
      fixture.cleanup();
    }
  });

  it('installs with explicit permissions via install store factories', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice12-install-'));
    tempDirs.push(dataDir);
    const fixture = createThirdPartyConformanceFixture();
    try {
      const trustChecker = createKernelExtensionTrustChecker(
        createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys()),
        createExtensionRevocationStore(),
      );
      const installStore = createExtensionInstallStore(dataDir);
      const requested = extractRequestedPermissions(fixture.manifest);
      const granted = grantedPermissionsFromManifest(requested, {
        uiSlots: [],
      });
      const result = installStore.install({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        installsRoot: join(dataDir, 'extensions', 'installed'),
        catalogRoot: join(dataDir, 'extensions', 'catalog'),
      });
      expect(result.success).toBe(true);
      expect(result.extension?.grantedPermissions.uiSlots).toEqual([]);
    } finally {
      fixture.cleanup();
    }
  });

  it('cannot exceed granted permissions at runtime', async () => {
    const fixture = createThirdPartyConformanceFixture({
      extensionSource: `export function createExtension() {
  return {
    id: '${THIRD_PARTY_MANIFEST_ID}',
    name: 'Overreach',
    version: '1.0.0',
    async initialize(ctx) {
      await ctx.clients.gateway.executeAction({ action: 'email.send', payload: {} });
    },
  };
}
`,
    });
    try {
      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        clients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient({
            active: false,
            tier: 'free',
            validUntil: null,
            seat: null,
          }),
        },
        grantedPermissions: grantedPermissionsFromManifest(
          {
            dataCapabilities: ['email.read'],
            actionCapabilities: ['email.send'],
            networkDestinations: ['api.google.com'],
            tools: [],
            uiSlots: [],
            schedules: [],
          },
          { actionCapabilities: [] },
        ),
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/action|Permission enforcement/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('uninstalls according to declared migration policy', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice12-uninstall-'));
    tempDirs.push(dataDir);
    const fixture = createThirdPartyConformanceFixture({
      permissions: {
        tools: ['summarize_inbox'],
        uiSlots: [],
        migration: { schemaVersion: 1, uninstall: 'delete' },
      },
    });
    try {
      const trustChecker = createKernelExtensionTrustChecker(
        createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys()),
        createExtensionRevocationStore(),
      );
      const installStore = createExtensionInstallStore(dataDir);
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const installed = installStore.install({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        installsRoot: join(dataDir, 'extensions', 'installed'),
        catalogRoot: join(dataDir, 'extensions', 'catalog'),
      });
      expect(installed.success).toBe(true);
      const installDir = installed.extension!.installDir;
      const uninstalled = installStore.uninstall(installed.extension!.manifestId, false);
      expect(uninstalled.success).toBe(true);
      expect(() => readFileSync(join(installDir, 'extension.manifest.json'))).toThrow();
    } finally {
      fixture.cleanup();
    }
  });

  it('enforces publisher trust and revocation on install', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'slice12-trust-'));
    tempDirs.push(dataDir);
    const fixture = createThirdPartyConformanceFixture();
    try {
      const trustStore = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
      const revocationStore = createExtensionRevocationStore();
      revocationStore.revokePublisher({
        publisherKeyId: 'dr-test-publisher-v1',
        reason: 'slice12-exit-gate',
      });
      const trustChecker = createKernelExtensionTrustChecker(trustStore, revocationStore);
      const installStore = createExtensionInstallStore(dataDir);
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const result = installStore.install({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        ownership: 'marketplace',
        installsRoot: join(dataDir, 'extensions', 'installed'),
        catalogRoot: join(dataDir, 'extensions', 'catalog'),
      });
      expect(result.success).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it('SDK surface exposes mediated clients only — no raw Vault/Gateway handles', () => {
    const exportNames = Object.keys(extensionSdk);
    expect(() => assertSdkSurfaceNoRawHandles(exportNames)).not.toThrow();
    expect(exportNames.some((name) => name.includes('RawVault'))).toBe(false);
    expect(exportNames.some((name) => name.includes('RawGateway'))).toBe(false);
    expect(exportNames).toContain('assertSdkSurfaceNoRawHandles');
  });
});

describe('Slice 12 exit gate — dependent suites present', () => {
  it('extension conformance suite paths exist', () => {
    const root = join(import.meta.dirname, '..');
    expect(readFileSync(join(root, 'extension-conformance/undeclared-access.test.ts'), 'utf8')).toContain(
      'undeclared',
    );
    expect(readFileSync(join(root, 'extension-conformance/resource-containment.test.ts'), 'utf8')).toContain(
      'timeout',
    );
    expect(readFileSync(join(root, 'extension-conformance/install-e2e.test.ts'), 'utf8')).toContain(
      'bridge factories',
    );
  });
});

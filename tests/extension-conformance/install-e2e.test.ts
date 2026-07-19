import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createExtensionInstallStore,
  createExtensionPublisherTrustStore,
  createExtensionRevocationStore,
  createKernelExtensionTrustChecker,
  extractRequestedPermissions,
  publishMarketplaceEntry,
  verifyMarketplaceCatalogEntry,
} from '@semblance/kernel';
import { loadDrPublisherKeys, sha256Prefixed } from '@semblance/extension-sdk';
import {
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  createTestEnforcedClients,
  loadSignedDigitalRepresentative,
  PermissionEnforcementError,
} from '@semblance/extension-runner';
import {
  createThirdPartyConformanceFixture,
  grantedPermissionsFromManifest,
  THIRD_PARTY_MANIFEST_ID,
} from './fixtures/third-party-fixture.js';

describe('extension conformance — install e2e via bridge factories', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createBridgeLikeHarness() {
    const dataDir = mkdtempSync(join(tmpdir(), 'conformance-bridge-'));
    tempDirs.push(dataDir);
    const fixture = createThirdPartyConformanceFixture();
    const trustStore = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
    const trustChecker = createKernelExtensionTrustChecker(
      trustStore,
      createExtensionRevocationStore(),
    );
    const installStore = createExtensionInstallStore(dataDir);
    const installsRoot = join(dataDir, 'extensions', 'installed');
    const catalogRoot = join(dataDir, 'extensions', 'catalog');
    const runnerClients = {
      vault: createRecordingVaultClient(),
      gateway: createRecordingGatewayClient(),
      kernel: createStubEntitlementClient({
        active: false,
        tier: 'free',
        validUntil: null,
        seat: null,
      }),
    };
    return {
      dataDir,
      fixture,
      trustStore,
      trustChecker,
      installStore,
      installsRoot,
      catalogRoot,
      runnerClients,
    };
  }

  it('installs third-party extension with explicit permissions end-to-end', async () => {
    const harness = createBridgeLikeHarness();
    try {
      const requested = extractRequestedPermissions(harness.fixture.manifest);
      const narrowGrant = grantedPermissionsFromManifest(
        {
          tools: requested.tools,
          uiSlots: requested.uiSlots,
        },
        {
          uiSlots: [],
        },
      );

      const installResult = harness.installStore.install({
        manifestPath: harness.fixture.manifestPath,
        artifactPath: harness.fixture.artifactPath,
        grantedPermissions: narrowGrant,
        trustChecker: harness.trustChecker,
        installsRoot: harness.installsRoot,
        catalogRoot: harness.catalogRoot,
      });
      expect(installResult.success).toBe(true);

      const runtime = await loadSignedDigitalRepresentative({
        manifestPath: installResult.extension!.manifestPath,
        artifactPath: installResult.extension!.artifactPath,
        clients: harness.runnerClients,
        dataDir: harness.dataDir,
        trustChecker: harness.trustChecker,
        grantedPermissions: installResult.extension!.grantedPermissions,
      });
      expect(runtime.ok).toBe(true);
      expect(runtime.manifestId).toBe(THIRD_PARTY_MANIFEST_ID);
    } finally {
      harness.fixture.cleanup();
    }
  });

  it('cannot exceed granted permissions at runtime', async () => {
    const harness = createBridgeLikeHarness();
    try {
      const granted = grantedPermissionsFromManifest(
        {
          tools: ['summarize_inbox'],
          uiSlots: ['settings.capabilities'],
        },
        {
          uiSlots: [],
        },
      );

      const installResult = harness.installStore.install({
        manifestPath: harness.fixture.manifestPath,
        artifactPath: harness.fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker: harness.trustChecker,
        installsRoot: harness.installsRoot,
        catalogRoot: harness.catalogRoot,
      });
      expect(installResult.success).toBe(true);

      const runtime = await loadSignedDigitalRepresentative({
        manifestPath: installResult.extension!.manifestPath,
        artifactPath: installResult.extension!.artifactPath,
        clients: harness.runnerClients,
        dataDir: harness.dataDir,
        trustChecker: harness.trustChecker,
        grantedPermissions: installResult.extension!.grantedPermissions,
      });
      expect(runtime.ok).toBe(true);

      const malicious = createThirdPartyConformanceFixture({
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
      const overreach = await loadSignedDigitalRepresentative({
        manifestPath: malicious.manifestPath,
        artifactPath: malicious.artifactPath,
        clients: harness.runnerClients,
        dataDir: harness.dataDir,
        trustChecker: harness.trustChecker,
        grantedPermissions: granted,
      });
      expect(overreach.ok).toBe(false);
      expect(overreach.error).toMatch(/action|Permission enforcement/i);
      malicious.cleanup();
    } finally {
      harness.fixture.cleanup();
    }
  });

  it('rejects install when publisher trust fails after revocation', () => {
    const harness = createBridgeLikeHarness();
    try {
      const revocationStore = createExtensionRevocationStore();
      revocationStore.revokePublisher({
        publisherKeyId: 'dr-test-publisher-v1',
        reason: 'conformance-revoke',
      });
      const trustChecker = createKernelExtensionTrustChecker(
        harness.trustStore,
        revocationStore,
      );
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const installResult = harness.installStore.install({
        manifestPath: harness.fixture.manifestPath,
        artifactPath: harness.fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        ownership: 'marketplace',
        installsRoot: harness.installsRoot,
        catalogRoot: harness.catalogRoot,
      });
      expect(installResult.success).toBe(false);
      expect(installResult.error).toMatch(/revok|trust|quarantine/i);
    } finally {
      harness.fixture.cleanup();
    }
  });

  it('verifies marketplace catalog hashes without storing user content', () => {
    const harness = createBridgeLikeHarness();
    try {
      const manifestBytes = readFileSync(harness.fixture.manifestPath);
      const artifactBytes = readFileSync(harness.fixture.artifactPath);
      const entry = {
        schemaVersion: 1 as const,
        manifestId: THIRD_PARTY_MANIFEST_ID,
        publisher: 'com.example.dev',
        version: '1.0.0',
        artifactHash: sha256Prefixed(artifactBytes),
        manifestHash: sha256Prefixed(manifestBytes),
        minCoreVersion: '1.0.0',
        reviewLevel: 'publisher-verified' as const,
        pricing: {
          model: 'free' as const,
          currency: 'USD',
          amountCents: 0,
          revenueShareBps: 1500,
        },
        compatibilityNotes: 'Requires Semblance core >= 1.0.0',
      };
      const verification = verifyMarketplaceCatalogEntry({
        entry,
        manifestBytes,
        artifactBytes,
        coreVersion: '1.0.0',
      });
      expect(verification.ok).toBe(true);

      expect(() =>
        publishMarketplaceEntry(
          { schemaVersion: 1, entries: [], disclaimer: 'No endorsement.' },
          {
            ...entry,
            userContent: ['secret'],
          } as never,
          manifestBytes,
          artifactBytes,
          '1.0.0',
        ),
      ).toThrow(/must not store user content/);
    } finally {
      harness.fixture.cleanup();
    }
  });
});

describe('extension conformance — SDK surface guard', () => {
  it('blocks gateway overreach through enforced clients directly', async () => {
    const clients = createTestEnforcedClients({
      dataCapabilities: ['email.read'],
      actionCapabilities: [],
      networkDestinations: [],
      tools: [],
      insightTypes: [],
      uiSlots: [],
      schedules: [],
      entitlement: null,
    });
    await expect(
      clients.gateway.executeAction({ action: 'email.send', payload: {} }),
    ).rejects.toBeInstanceOf(PermissionEnforcementError);
  });
});

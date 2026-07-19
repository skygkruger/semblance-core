import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createExtensionInstallStore,
  createExtensionPublisherTrustStore,
  createExtensionRevocationStore,
  createKernelExtensionTrustChecker,
} from '@semblance/kernel';
import { loadDrPublisherKeys } from '@semblance/extension-sdk';
import {
  createThirdPartyConformanceFixture,
  grantedPermissionsFromManifest,
} from './fixtures/third-party-fixture.js';

describe('extension conformance — migration and uninstall policy', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createInstallHarness(migrationUninstall: 'delete' | 'retain_user_data' | 'ask') {
    const dataDir = mkdtempSync(join(tmpdir(), 'conformance-install-'));
    tempDirs.push(dataDir);
    const fixture = createThirdPartyConformanceFixture({
      permissions: {
        tools: ['summarize_inbox'],
        uiSlots: [],
        migration: { schemaVersion: 1, uninstall: migrationUninstall },
      },
    });
    const trustStore = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
    const trustChecker = createKernelExtensionTrustChecker(
      trustStore,
      createExtensionRevocationStore(),
    );
    const installStore = createExtensionInstallStore(dataDir);
    const installsRoot = join(dataDir, 'extensions', 'installed');
    const catalogRoot = join(dataDir, 'extensions', 'catalog');
    return { dataDir, fixture, installStore, trustChecker, installsRoot, catalogRoot };
  }

  it('honors retain_user_data uninstall policy', () => {
    const { fixture, installStore, trustChecker, installsRoot, catalogRoot } =
      createInstallHarness('retain_user_data');
    try {
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const installed = installStore.install({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        installsRoot,
        catalogRoot,
      });
      expect(installed.success).toBe(true);
      const installDir = installed.extension!.installDir;
      expect(existsSync(installDir)).toBe(true);

      const uninstalled = installStore.uninstall(installed.extension!.manifestId, false);
      expect(uninstalled.success).toBe(true);
      expect(existsSync(installDir)).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('honors delete uninstall policy', () => {
    const { fixture, installStore, trustChecker, installsRoot, catalogRoot } =
      createInstallHarness('delete');
    try {
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const installed = installStore.install({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        installsRoot,
        catalogRoot,
      });
      expect(installed.success).toBe(true);
      const installDir = installed.extension!.installDir;

      const uninstalled = installStore.uninstall(installed.extension!.manifestId, false);
      expect(uninstalled.success).toBe(true);
      expect(existsSync(installDir)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it('honors ask uninstall policy with explicit retain flag', () => {
    const { fixture, installStore, trustChecker, installsRoot, catalogRoot } =
      createInstallHarness('ask');
    try {
      const granted = grantedPermissionsFromManifest({
        tools: ['summarize_inbox'],
        uiSlots: [],
      });
      const installed = installStore.install({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        grantedPermissions: granted,
        trustChecker,
        installsRoot,
        catalogRoot,
      });
      expect(installed.success).toBe(true);
      const installDir = installed.extension!.installDir;

      const retained = installStore.uninstall(installed.extension!.manifestId, true);
      expect(retained.success).toBe(true);
      expect(existsSync(installDir)).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

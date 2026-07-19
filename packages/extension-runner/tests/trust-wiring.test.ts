import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadDrPublisherKeys } from '@semblance/extension-sdk';
import {
  createExtensionPublisherTrustStore,
  createExtensionRevocationStore,
  createKernelExtensionTrustChecker,
} from '@semblance/kernel';
import {
  createArtifactOnlyExtensionTrustChecker,
  loadSignedDigitalRepresentative,
  verifySignedArtifactPaths,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
} from '../src/index.js';
import { createSignedFixtureExtension } from './fixture-helper.js';

describe('extension runner trust wiring', () => {
  it('loadSignedDigitalRepresentative consults injected kernel trust checker', async () => {
    const trustStore = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
    const revocationStore = createExtensionRevocationStore();
    const trustChecker = createKernelExtensionTrustChecker(trustStore, revocationStore);
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return { id: '@semblance/dr', name: 'Fixture DR', version: '0.1.0' };
}
`,
    });

    try {
      const verification = verifySignedArtifactPaths({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        trustChecker,
      });
      expect(verification.valid).toBe(true);

      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        trustChecker,
        clients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient(null),
        },
      });
      expect(result.ok).toBe(true);
      expect(result.trustLevel).toBe('built-in');
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects quarantined publisher through injected trust checker', async () => {
    const trustStore = createExtensionPublisherTrustStore(undefined, loadDrPublisherKeys());
    const revocationStore = createExtensionRevocationStore();
    revocationStore.revokePublisher({
      publisherKeyId: 'dr-test-publisher-v1',
      reason: 'Test quarantine',
    });
    const trustChecker = createKernelExtensionTrustChecker(trustStore, revocationStore);
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return { id: '@semblance/dr', name: 'Fixture DR', version: '0.1.0' };
}
`,
    });

    try {
      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        trustChecker,
        ownership: 'marketplace',
        clients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient(null),
        },
      });
      expect(result.ok).toBe(false);
      expect(result.quarantined).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('defaults to artifact-only trust checker without kernel injection', async () => {
    const checker = createArtifactOnlyExtensionTrustChecker(loadDrPublisherKeys());
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return { id: '@semblance/dr', name: 'Fixture DR', version: '0.1.0' };
}
`,
    });

    try {
      const evaluation = checker.checkTrust({
        manifest: fixture.manifest,
        artifactBytes: readFileSync(fixture.artifactPath),
        coreVersion: '1.0.0',
      });
      expect(evaluation.allowed).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

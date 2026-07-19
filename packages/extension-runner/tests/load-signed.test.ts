import { describe, expect, it } from 'vitest';
import {
  createExtensionSandbox,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  loadSignedDigitalRepresentative,
  verifySignedArtifactPaths,
} from '../src/index.js';
import { createSignedFixtureExtension } from './fixture-helper.js';

describe('@semblance/extension-runner sandbox', () => {
  it('denies fetch from extension context', async () => {
    const sandbox = createExtensionSandbox({ allowedWritePaths: [] });
    sandbox.assertFetchBlocked();

    await expect(
      sandbox.run(async () => {
        await fetch('https://example.com');
      }),
    ).rejects.toThrow(/network/i);
  });

  it('denies fs writes outside allowlist', () => {
    const allowed = '/tmp/allowed-write';
    const sandbox = createExtensionSandbox({ allowedWritePaths: [allowed] });
    sandbox.assertWriteOutsideAllowlistBlocked(allowed);
  });

  it('denies secret process.env reads', () => {
    process.env.SEMBLANCE_LICENSE_KEY = 'sem_test';
    const sandbox = createExtensionSandbox({ allowedWritePaths: [] });
    sandbox.assertSecretEnvBlocked();
    delete process.env.SEMBLANCE_LICENSE_KEY;
  });
});

describe('@semblance/extension-runner loadSignedDigitalRepresentative', () => {
  it('rejects unsigned artifact', async () => {
    const fixture = createSignedFixtureExtension({ unsigned: true });
    try {
      const verification = verifySignedArtifactPaths({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
      });
      expect(verification.valid).toBe(false);

      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        clients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient({
            active: true,
            tier: 'digital-representative',
            validUntil: null,
            seat: null,
          }),
        },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/unsigned|Signature/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('rejects modified artifact hash', async () => {
    const fixture = createSignedFixtureExtension({ tamperArtifact: true });
    try {
      const verification = verifySignedArtifactPaths({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
      });
      expect(verification.valid).toBe(false);
      expect(verification.error).toMatch(/hash mismatch/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('loads valid signed artifact with entitlement clients', async () => {
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return {
    id: '@semblance/dr',
    name: 'Fixture DR',
    version: '0.1.0',
    initialize(ctx) {
      globalThis.__fixtureInit = ctx;
    },
  };
}
`,
    });

    const gateway = createRecordingGatewayClient();
    const vault = createRecordingVaultClient();

    try {
      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        clients: {
          vault,
          gateway,
          kernel: createStubEntitlementClient({
            active: true,
            tier: 'digital-representative',
            validUntil: null,
            seat: null,
          }),
        },
      });

      expect(result.ok).toBe(true);
      expect(result.extension?.id).toBe('@semblance/dr');
      expect(result.artifactValid).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

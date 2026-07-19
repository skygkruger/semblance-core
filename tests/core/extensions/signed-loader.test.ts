import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearExtensions,
  getDigitalRepresentativeArtifactStatus,
  loadExtensions,
} from '@semblance/core/extensions/loader';
import {
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
} from '@semblance/extension-runner';
import { createSignedFixtureExtension } from '../../../packages/extension-runner/tests/fixture-helper.js';

const SAFE_FIXTURE_EXTENSION = `export function createExtension() {
  return {
    id: '@semblance/dr',
    name: 'Fixture DR',
    version: '0.1.0',
    initialize(ctx) {
      globalThis.__fixtureInit = ctx;
    },
  };
}
`;

const previousManifest = process.env.SEMBLANCE_DR_MANIFEST;
const previousArtifact = process.env.SEMBLANCE_DR_ARTIFACT;

beforeEach(() => {
  clearExtensions();
  delete process.env.SEMBLANCE_DR_MANIFEST;
  delete process.env.SEMBLANCE_DR_ARTIFACT;
});

afterEach(() => {
  clearExtensions();
  if (previousManifest) {
    process.env.SEMBLANCE_DR_MANIFEST = previousManifest;
  } else {
    delete process.env.SEMBLANCE_DR_MANIFEST;
  }
  if (previousArtifact) {
    process.env.SEMBLANCE_DR_ARTIFACT = previousArtifact;
  } else {
    delete process.env.SEMBLANCE_DR_ARTIFACT;
  }
});

describe('signed extension loader wiring', () => {
  it('prefers runner when SEMBLANCE_DR_MANIFEST is configured', async () => {
    const fixture = createSignedFixtureExtension({
      extensionSource: `export function createExtension() {
  return {
    id: '@semblance/dr',
    name: 'Fixture DR',
    version: '0.1.0',
    tools: [{ definition: { name: 'fixture_tool', description: 'test', parameters: { type: 'object', properties: {} } }, handler: async () => ({ result: 'ok' }), isLocal: true }],
  };
}
`,
    });

    process.env.SEMBLANCE_DR_MANIFEST = fixture.manifestPath;
    process.env.SEMBLANCE_DR_ARTIFACT = fixture.artifactPath;

    try {
      const extensions = await loadExtensions({
        runnerClients: {
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

      const status = getDigitalRepresentativeArtifactStatus();
      expect(status.configured).toBe(true);
      expect(status.valid).toBe(true);
      expect(status.loadedViaRunner).toBe(true);
      expect(extensions).toHaveLength(1);
      expect(extensions[0]?.id).toBe('@semblance/dr');
    } finally {
      fixture.cleanup();
    }
  });

  it('does not grant paid readiness for dev dynamic import fallback', async () => {
    const extensions = await loadExtensions();
    const status = getDigitalRepresentativeArtifactStatus();

    expect(status.configured).toBe(false);
    expect(status.loadedViaRunner).toBe(false);
    expect(Array.isArray(extensions)).toBe(true);
  });

  it('marks artifact invalid when manifest points to tampered tarball', async () => {
    const fixture = createSignedFixtureExtension({
      tamperArtifact: true,
      extensionSource: SAFE_FIXTURE_EXTENSION,
    });
    process.env.SEMBLANCE_DR_MANIFEST = fixture.manifestPath;

    try {
      await loadExtensions({
        runnerClients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient(null),
        },
      });
      const status = getDigitalRepresentativeArtifactStatus();
      expect(status.configured).toBe(true);
      expect(status.valid).toBe(false);
      expect(status.loadedViaRunner).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it('resolves artifact path from manifest directory when SEMBLANCE_DR_ARTIFACT is unset', async () => {
    const fixture = createSignedFixtureExtension({ extensionSource: SAFE_FIXTURE_EXTENSION });
    process.env.SEMBLANCE_DR_MANIFEST = fixture.manifestPath;

    try {
      await loadExtensions({
        runnerClients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient(null),
        },
      });
      const status = getDigitalRepresentativeArtifactStatus();
      expect(status.valid).toBe(true);
      expect(status.loadedViaRunner).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('resolves manifest beside SEMBLANCE_DR_ARTIFACT directory', async () => {
    const fixture = createSignedFixtureExtension({ extensionSource: SAFE_FIXTURE_EXTENSION });
    process.env.SEMBLANCE_DR_ARTIFACT = fixture.artifactPath;

    try {
      await loadExtensions({
        runnerClients: {
          vault: createRecordingVaultClient(),
          gateway: createRecordingGatewayClient(),
          kernel: createStubEntitlementClient(null),
        },
      });
      const status = getDigitalRepresentativeArtifactStatus();
      expect(status.configured).toBe(true);
      expect(status.valid).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});

describe('PremiumGate readiness integration', () => {
  it('assertDigitalRepresentativeReady fails for premium without signed runner load', async () => {
    const { PremiumGate } = await import('@semblance/core/premium/premium-gate');
    const db = {
      exec: () => undefined,
      prepare: () => ({
        get: () => ({ tier: 'digital-representative', expires_at: null, founding_seat: null }),
        all: () => [],
        run: () => undefined,
      }),
    };

    const gate = new PremiumGate(db as never);
    await loadExtensions();
    const status = getDigitalRepresentativeArtifactStatus();

    expect(gate.isPremium()).toBe(true);
    expect(() =>
      gate.assertDigitalRepresentativeReady({
        artifactPresent: status.configured && status.present,
        artifactValid: status.valid && status.loadedViaRunner,
      }),
    ).toThrow(/artifact/i);
  });
});

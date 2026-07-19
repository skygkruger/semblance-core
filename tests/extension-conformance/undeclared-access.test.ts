import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PermissionEnforcementError,
  SandboxViolationError,
  createExtensionSandbox,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
  createTestEnforcedClients,
  loadSignedDigitalRepresentative,
} from '@semblance/extension-runner';
import {
  createThirdPartyConformanceFixture,
  grantedPermissionsFromManifest,
} from './fixtures/third-party-fixture.js';

function baseClients() {
  return {
    vault: createRecordingVaultClient(),
    gateway: createRecordingGatewayClient(),
    kernel: createStubEntitlementClient({
      active: false,
      tier: 'free',
      validUntil: null,
      seat: null,
    }),
  };
}

describe('extension conformance — undeclared access blocked', () => {
  it('blocks undeclared network fetch in sandbox', async () => {
    const fixture = createThirdPartyConformanceFixture({
      extensionSource: `export function createExtension() {
  return {
    id: 'com.example.conformance.demo',
    name: 'Network Probe',
    version: '1.0.0',
    async initialize() {
      await fetch('https://blocked.example');
    },
  };
}
`,
      permissions: {
        tools: ['summarize_inbox'],
        uiSlots: [],
      },
    });
    try {
      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        clients: baseClients(),
        grantedPermissions: grantedPermissionsFromManifest({
          tools: ['summarize_inbox'],
          uiSlots: [],
        }),
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/network|Sandbox violation/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('blocks undeclared filesystem writes outside allowlist', async () => {
    const sandbox = createExtensionSandbox({ allowedWritePaths: ['/tmp/allowed'] });
    await expect(
      sandbox.run(async () => {
        fs.writeFileSync('/tmp/blocked-by-conformance.txt', 'nope');
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
  });

  it('blocks undeclared vault reads when data capabilities are not granted', async () => {
    const fixture = createThirdPartyConformanceFixture({
      extensionSource: `export function createExtension() {
  return {
    id: 'com.example.conformance.demo',
    name: 'Vault Probe',
    version: '1.0.0',
    async initialize(ctx) {
      await ctx.clients.vault.searchDocuments({ query: 'secret', sources: ['email.read'] });
    },
  };
}
`,
      permissions: {
        tools: ['summarize_inbox'],
        uiSlots: [],
      },
    });
    try {
      const result = await loadSignedDigitalRepresentative({
        manifestPath: fixture.manifestPath,
        artifactPath: fixture.artifactPath,
        clients: baseClients(),
        grantedPermissions: grantedPermissionsFromManifest({
          tools: ['summarize_inbox'],
          uiSlots: [],
        }),
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/data|Permission enforcement/i);
    } finally {
      fixture.cleanup();
    }
  });

  it('blocks undeclared secret env reads', async () => {
    process.env.SEMBLANCE_LICENSE_KEY = 'sem_test';
    const sandbox = createExtensionSandbox({ allowedWritePaths: [] });
    await expect(
      sandbox.run(async () => {
        void process.env.SEMBLANCE_LICENSE_KEY;
      }),
    ).rejects.toBeInstanceOf(SandboxViolationError);
    delete process.env.SEMBLANCE_LICENSE_KEY;
  });

  it('blocks undeclared gateway actions', async () => {
    const clients = createTestEnforcedClientsSubset({
      actionCapabilities: [],
    });
    await expect(
      clients.gateway.executeAction({ action: 'email.send', payload: {} }),
    ).rejects.toBeInstanceOf(PermissionEnforcementError);
  });

  it('blocks undeclared UI slot registration', async () => {
    const clients = createTestEnforcedClientsSubset({
      uiSlots: [],
    });
    expect(() =>
      clients.uiSlots.register({
        slotId: 'settings.capabilities',
        registration: { component: () => null },
      }),
    ).toThrow(/not in granted permissions/);
  });

  it('blocks undeclared schedule registration', async () => {
    const clients = createTestEnforcedClientsSubset({
      schedules: [],
    });
    await expect(
      clients.schedules.register({
        spec: {
          scheduleId: 'daily_digest',
          cron: '0 9 * * *',
          action: 'digest.run',
        },
      }),
    ).rejects.toBeInstanceOf(PermissionEnforcementError);
  });
});

function createTestEnforcedClientsSubset(
  granted: Partial<{
    dataCapabilities: string[];
    actionCapabilities: string[];
    networkDestinations: string[];
    uiSlots: string[];
    schedules: string[];
  }>,
) {
  const clients = createTestEnforcedClients({
    dataCapabilities: granted.dataCapabilities ?? ['email.read'],
    actionCapabilities: granted.actionCapabilities ?? ['email.send'],
    networkDestinations: granted.networkDestinations ?? ['api.google.com'],
    tools: [],
    insightTypes: [],
    uiSlots: granted.uiSlots ?? ['settings.capabilities'],
    schedules: granted.schedules ?? ['daily_digest'],
    entitlement: null,
  });
  return clients;
}

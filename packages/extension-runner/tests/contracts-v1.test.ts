import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXTENSION_API_V1,
  EXTENSION_PLATFORM_API_V1,
  parseExtensionManifestV1,
} from '@semblance/extension-sdk';
import {
  LOADED_EXTENSION_API,
  buildExtensionInitContextV1,
  buildExtensionRunnerClientsV1,
  createRecordingGatewayClient,
  createRecordingVaultClient,
  createStubEntitlementClient,
} from '@semblance/extension-runner';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'protocol',
  'fixtures',
  'cross-repo',
  'extension-manifest-v1.json',
);

describe('@semblance/extension-runner Extension API v1 wiring', () => {
  it('loads frozen Extension API v1 generation', () => {
    expect(LOADED_EXTENSION_API).toBe(EXTENSION_API_V1);
  });

  it('builds mediated v1 init context from protocol manifest fixture (see docs/extensions/getting-started.md)', () => {
    const manifest = parseExtensionManifestV1(
      JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown,
    );
    expect(manifest.platformApi).toBe(EXTENSION_PLATFORM_API_V1);

    const baseClients = {
      vault: createRecordingVaultClient(),
      gateway: createRecordingGatewayClient(),
      kernel: createStubEntitlementClient({ active: true, tier: 'digital-representative', validUntil: null, seat: 1 }),
    };

    const ctx = buildExtensionInitContextV1({
      extensionId: manifest.id,
      dataDir: '/tmp/extension-data',
      clients: buildExtensionRunnerClientsV1(baseClients),
      declaredManifest: {
        uiSlots: manifest.uiSlots,
        schedules: manifest.schedules,
        migration: manifest.migration,
      },
    });

    expect(ctx.clients.vault.searchDocuments).toBeTypeOf('function');
    expect(ctx.clients.gateway.executeAction).toBeTypeOf('function');
    expect(ctx.uiSlots.listDeclaredSlots()).toEqual(manifest.uiSlots);
    expect(ctx.migration.getDeclaredPolicy().uninstall).toBe('retain_user_data');
    expect(ctx.health.ping).toBeTypeOf('function');
    expect(ctx.receipts.listRecent).toBeTypeOf('function');
  });

  it('rejects undeclared UI slot registration', async () => {
    const ctx = buildExtensionInitContextV1({
      extensionId: 'com.example.test',
      dataDir: '/tmp',
      clients: buildExtensionRunnerClientsV1({
        vault: createRecordingVaultClient(),
        gateway: createRecordingGatewayClient(),
        kernel: createStubEntitlementClient(null),
      }),
      declaredManifest: {
        uiSlots: ['settings.capabilities'],
        schedules: [],
        migration: { schemaVersion: 0, uninstall: 'ask' },
      },
    });

    expect(() =>
      ctx.uiSlots.register({
        slotId: 'chat.sidebar',
        registration: { component: () => null },
      }),
    ).toThrow(/not declared in manifest.uiSlots/);
  });
});

/**
 * Gateway extension adapter registration tests.
 * Verifies registerExtensionAdapters registers adapters and
 * oauthTokenManager is accessible after start.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Gateway } from '@semblance/gateway/index';
import type { ExtensionGatewayAdapter, GatewayExtensionContext } from '@semblance/core/extensions/types';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { nanoid } from 'nanoid';

let tmpDir: string;

function pipePath(): string {
  // On Windows, use named pipes; on Unix, use temp socket file
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\semblance-ext-test-${nanoid(8)}`;
  }
  return join(tmpDir, `test-${nanoid(6)}.sock`);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'gw-ext-test-'));
});

afterEach(() => {
  try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
});

describe('Gateway Extension Adapters', () => {
  it('registerExtensionAdapters registers adapter with service registry', async () => {
    const gw = new Gateway({
      dataDir: tmpDir,
      socketPath: pipePath(),
      signingKeyPath: join(tmpDir, 'test.key'),
    });

    await gw.start();

    let factoryCalled = false;
    const mockAdapter: ExtensionGatewayAdapter = {
      actionType: 'finance.plaid_link',
      createAdapter: (_ctx: GatewayExtensionContext) => {
        factoryCalled = true;
        return {
          execute: async () => ({ success: true, data: { linked: true } }),
        };
      },
    };

    gw.registerExtensionAdapters([mockAdapter]);
    expect(factoryCalled).toBe(true);

    // Verify the adapter was registered
    const registry = gw.getServiceRegistry();
    expect(registry.hasRealAdapter('finance.plaid_link')).toBe(true);

    await gw.stop();
  });

  it('oauthTokenManager accessible after start', async () => {
    const gw = new Gateway({
      dataDir: tmpDir,
      socketPath: pipePath(),
      signingKeyPath: join(tmpDir, 'test2.key'),
    });

    await gw.start();

    const tokenMgr = gw.getOAuthTokenManager();
    expect(tokenMgr).toBeDefined();
    expect(typeof tokenMgr.getAccessToken).toBe('function');

    await gw.stop();
  });
});

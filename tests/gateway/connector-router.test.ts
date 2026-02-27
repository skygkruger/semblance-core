/**
 * ConnectorRouter Tests — Routes connector.* actions to the correct adapter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectorRouter } from '../../packages/gateway/services/connector-router.js';
import type { ServiceAdapter } from '../../packages/gateway/services/types.js';
import type { ActionType } from '../../packages/core/types/ipc.js';

function createMockAdapter(data: unknown = { ok: true }): ServiceAdapter {
  return {
    execute: vi.fn().mockResolvedValue({ success: true, data }),
  };
}

describe('ConnectorRouter', () => {
  let router: ConnectorRouter;

  beforeEach(() => {
    router = new ConnectorRouter();
  });

  it('routes to the correct adapter based on connectorId', async () => {
    const spotifyAdapter = createMockAdapter({ tracks: [] });
    const githubAdapter = createMockAdapter({ repos: [] });
    router.registerAdapter('spotify', spotifyAdapter);
    router.registerAdapter('github', githubAdapter);

    const result = await router.execute('connector.sync' as ActionType, {
      connectorId: 'spotify',
    });

    expect(result.success).toBe(true);
    expect(spotifyAdapter.execute).toHaveBeenCalledWith('connector.sync', {
      connectorId: 'spotify',
    });
    expect(githubAdapter.execute).not.toHaveBeenCalled();
  });

  it('returns error when connectorId is missing', async () => {
    const result = await router.execute('connector.auth' as ActionType, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('MISSING_CONNECTOR_ID');
  });

  it('returns error for unregistered connector', async () => {
    const result = await router.execute('connector.sync' as ActionType, {
      connectorId: 'nonexistent',
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('UNKNOWN_CONNECTOR');
  });

  it('hasAdapter() reports registration status', () => {
    const adapter = createMockAdapter();
    router.registerAdapter('spotify', adapter);
    expect(router.hasAdapter('spotify')).toBe(true);
    expect(router.hasAdapter('github')).toBe(false);
  });

  it('listRegistered() returns all registered IDs', () => {
    router.registerAdapter('spotify', createMockAdapter());
    router.registerAdapter('github', createMockAdapter());
    const ids = router.listRegistered();
    expect(ids).toContain('spotify');
    expect(ids).toContain('github');
    expect(ids).toHaveLength(2);
  });

  it('getAdapter() returns the adapter for a given ID', () => {
    const adapter = createMockAdapter();
    router.registerAdapter('spotify', adapter);
    expect(router.getAdapter('spotify')).toBe(adapter);
    expect(router.getAdapter('nonexistent')).toBeUndefined();
  });
});

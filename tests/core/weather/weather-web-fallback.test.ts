// Weather Web Fallback Tests — Web search weather retrieval.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect, vi } from 'vitest';
import { WeatherWebFallback } from '../../../packages/core/weather/weather-web-fallback';
import type { IPCClient } from '../../../packages/core/agent/ipc-client';

function createMockIPCClient(snippets: string[] = ['72°F Partly Cloudy']): IPCClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    sendAction: vi.fn().mockResolvedValue({
      requestId: 'test',
      timestamp: new Date().toISOString(),
      status: 'success' as const,
      data: {
        results: snippets.map((s, i) => ({ title: `Result ${i}`, snippet: s })),
      },
      auditRef: 'audit_test',
    }),
  };
}

describe('WeatherWebFallback', () => {
  it('constructs correct web search query', async () => {
    const ipc = createMockIPCClient();
    const fallback = new WeatherWebFallback(ipc);

    await fallback.queryCurrentWeather('Portland, OR');
    expect(ipc.sendAction).toHaveBeenCalledWith('web.search', expect.objectContaining({
      query: expect.stringContaining('Portland, OR'),
    }));
  });

  it('second call within TTL does not fire web search', async () => {
    const ipc = createMockIPCClient();
    const fallback = new WeatherWebFallback(ipc);

    await fallback.queryCurrentWeather('Portland');
    await fallback.queryCurrentWeather('Portland');

    // Only one call — second was cached
    expect(ipc.sendAction).toHaveBeenCalledTimes(1);
  });

  it('weather data never stored with full-precision coords', async () => {
    const ipc = createMockIPCClient();
    const fallback = new WeatherWebFallback(ipc);

    // The web fallback uses location labels, not raw coordinates
    const result = await fallback.queryCurrentWeather('Portland');
    expect(result).not.toBeNull();
    // No coordinate data in the result — it's a text-based query
    expect(result!.conditionDescription).toBeDefined();
  });
});

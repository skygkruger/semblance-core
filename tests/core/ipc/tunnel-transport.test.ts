// Tests for TunnelTransport — send/receive, timeout, retry, heartbeat.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TunnelTransport, TunnelTransportError } from '@semblance/core/ipc/tunnel-transport.js';

function createMockFetch(responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>) {
  let callIndex = 0;
  return vi.fn(async (_url: string, _opts?: RequestInit) => {
    const resp = responses[callIndex] ?? responses[responses.length - 1]!;
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => resp.json,
      text: async () => resp.text ?? '',
    } as Response;
  });
}

describe('TunnelTransport', () => {
  describe('send', () => {
    it('sends ActionRequest and returns ActionResponse', async () => {
      const mockFetch = createMockFetch([{
        ok: true, status: 200,
        json: { requestId: 'r1', timestamp: '', status: 'success', data: { text: 'hello' }, auditRef: 'a1' },
      }]);

      const transport = new TunnelTransport({
        remoteHost: '100.64.0.2',
        remotePort: 51821,
        fetchFn: mockFetch,
      });

      const response = await transport.send({
        id: 'req-1',
        timestamp: new Date().toISOString(),
        action: 'email.fetch' as any,
        payload: {},
        source: 'core',
        signature: 'sig',
      });

      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://100.64.0.2:51821/action',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws REJECTED on 4xx response', async () => {
      const mockFetch = createMockFetch([{ ok: false, status: 400, text: 'Bad Request' }]);
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2', fetchFn: mockFetch });

      await expect(transport.send({
        id: 'r1', timestamp: '', action: 'email.fetch' as any,
        payload: {}, source: 'core', signature: '',
      })).rejects.toThrow(TunnelTransportError);
    });

    it('retries on 5xx errors with backoff', async () => {
      const mockFetch = createMockFetch([
        { ok: false, status: 500, text: 'Server Error' },
        { ok: false, status: 500, text: 'Server Error' },
        { ok: true, status: 200, json: { requestId: 'r1', status: 'success', auditRef: 'a' } },
      ]);
      const transport = new TunnelTransport({
        remoteHost: '100.64.0.2', fetchFn: mockFetch, maxRetries: 3,
      });

      const response = await transport.send({
        id: 'r1', timestamp: '', action: 'email.fetch' as any,
        payload: {}, source: 'core', signature: '',
      });
      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15000);

    it('does not retry on 4xx', async () => {
      const mockFetch = createMockFetch([{ ok: false, status: 403, text: 'Forbidden' }]);
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2', fetchFn: mockFetch, maxRetries: 3 });

      try {
        await transport.send({
          id: 'r1', timestamp: '', action: 'email.fetch' as any,
          payload: {}, source: 'core', signature: '',
        });
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TunnelTransportError);
        expect((e as TunnelTransportError).code).toBe('REJECTED');
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('isReady and heartbeat', () => {
    it('starts not ready', () => {
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2' });
      expect(transport.isReady()).toBe(false);
    });

    it('becomes ready after successful health check', async () => {
      const mockFetch = createMockFetch([
        { ok: true, status: 200, json: { ok: true, deviceId: 'desktop-1' } },
      ]);
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2', fetchFn: mockFetch });
      await transport.start();
      expect(transport.isReady()).toBe(true);
      expect(transport.getRemoteDeviceId()).toBe('desktop-1');
      await transport.stop();
    });

    it('becomes not ready after stop', async () => {
      const mockFetch = createMockFetch([
        { ok: true, status: 200, json: { ok: true } },
      ]);
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2', fetchFn: mockFetch });
      await transport.start();
      await transport.stop();
      expect(transport.isReady()).toBe(false);
    });

    it('becomes not ready on health check failure', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' } as Response;
        throw new Error('Connection refused');
      });
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2', fetchFn: mockFetch });
      await transport.start();
      expect(transport.isReady()).toBe(true);
      // Manually trigger health failure
      await (transport as any).checkHealth();
      expect(transport.isReady()).toBe(false);
      await transport.stop();
    });
  });

  describe('getBaseUrl', () => {
    it('constructs correct URL', () => {
      const transport = new TunnelTransport({ remoteHost: '100.64.0.2', remotePort: 51821 });
      expect(transport.getBaseUrl()).toBe('http://100.64.0.2:51821');
    });

    it('uses default port', () => {
      const transport = new TunnelTransport({ remoteHost: '100.64.0.5' });
      expect(transport.getBaseUrl()).toBe('http://100.64.0.5:51821');
    });
  });
});

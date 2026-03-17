// Tests for TunnelGatewayServer — endpoints, action routing, audit logging.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TunnelGatewayServer } from '../../packages/gateway/tunnel/tunnel-gateway-server.js';

describe('TunnelGatewayServer', () => {
  let server: TunnelGatewayServer;
  let mockValidate: (request: unknown) => Promise<unknown>;

  beforeEach(() => {
    mockValidate = vi.fn(async (req: unknown) => ({
      requestId: 'resp-1',
      timestamp: new Date().toISOString(),
      status: 'success',
      data: { processed: true },
      auditRef: 'audit-1',
    }));

    server = new TunnelGatewayServer({
      bindAddress: '127.0.0.1',
      port: 0, // random port for tests
      validateAndExecute: mockValidate,
      deviceId: 'test-desktop',
      platform: 'test',
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('lifecycle', () => {
    it('starts and reports running', async () => {
      // Use a random high port to avoid conflicts
      server = new TunnelGatewayServer({
        bindAddress: '127.0.0.1',
        port: 59100 + Math.floor(Math.random() * 900),
        validateAndExecute: mockValidate,
        deviceId: 'test',
      });
      await server.start();
      expect(server.isRunning()).toBe(true);
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('getStatus returns correct info', () => {
      const status = server.getStatus();
      expect(status.running).toBe(false);
      expect(status.bindAddress).toBe('127.0.0.1');
      expect(status.connectedPeers).toBe(0);
    });
  });

  describe('end-to-end request/response', async () => {
    const port = 59200 + Math.floor(Math.random() * 800);

    it('POST /action sends to validateAndExecute and returns response', async () => {
      server = new TunnelGatewayServer({
        bindAddress: '127.0.0.1',
        port,
        validateAndExecute: mockValidate,
        deviceId: 'e2e-test',
      });
      await server.start();

      const resp = await fetch(`http://127.0.0.1:${port}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'req-1',
          timestamp: new Date().toISOString(),
          action: 'email.fetch',
          payload: {},
          source: 'core',
          signature: 'test-sig',
        }),
      });

      expect(resp.ok).toBe(true);
      const data = await resp.json();
      expect(data.data?.processed).toBe(true);
      expect(mockValidate).toHaveBeenCalledTimes(1);
      await server.stop();
    });

    it('GET /health returns ok', async () => {
      server = new TunnelGatewayServer({
        bindAddress: '127.0.0.1',
        port: port + 1,
        validateAndExecute: mockValidate,
        deviceId: 'health-test',
      });
      await server.start();

      const resp = await fetch(`http://127.0.0.1:${port + 1}/health`);
      expect(resp.ok).toBe(true);
      const data = await resp.json() as { ok: boolean; deviceId: string };
      expect(data.ok).toBe(true);
      expect(data.deviceId).toBe('health-test');
      await server.stop();
    });

    it('GET /info returns capabilities', async () => {
      server = new TunnelGatewayServer({
        bindAddress: '127.0.0.1',
        port: port + 2,
        validateAndExecute: mockValidate,
        deviceId: 'info-test',
      });
      await server.start();

      const resp = await fetch(`http://127.0.0.1:${port + 2}/info`);
      const data = await resp.json() as { capabilities: string[] };
      expect(data.capabilities).toContain('inference');
      expect(data.capabilities).toContain('audit');
      await server.stop();
    });

    it('returns 404 for unknown paths', async () => {
      server = new TunnelGatewayServer({
        bindAddress: '127.0.0.1',
        port: port + 3,
        validateAndExecute: mockValidate,
      });
      await server.start();

      const resp = await fetch(`http://127.0.0.1:${port + 3}/nonexistent`);
      expect(resp.status).toBe(404);
      await server.stop();
    });
  });
});

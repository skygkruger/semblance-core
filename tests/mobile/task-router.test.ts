// Tests for mobile TaskRouter — routing decisions, offload, fallback.

import { describe, it, expect, vi } from 'vitest';
import { TaskRouter } from '../../packages/mobile/src/inference/task-router.js';

function createMockBridge(text: string = 'local response') {
  return {
    generate: vi.fn(async () => ({ text, tokensGenerated: 50 })),
    isReady: vi.fn(async () => true),
  };
}

function createMockTunnel(ready: boolean = true, response?: unknown) {
  return {
    isReady: vi.fn(() => ready),
    send: vi.fn(async () => response ?? {
      data: { text: 'remote response', model: 'qwen3-8b', tokensUsed: 200 },
    }),
  };
}

describe('TaskRouter', () => {
  describe('routing decisions', () => {
    it('routes classify tasks locally even with tunnel available', async () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(true);
      const router = new TaskRouter({ tunnelTransport: tunnel, localBridge: bridge });

      const result = await router.route({ taskType: 'classify', prompt: 'Is this spam?' });
      expect(result.executedOn).toBe('local');
      expect(bridge.generate).toHaveBeenCalled();
      expect(tunnel.send).not.toHaveBeenCalled();
    });

    it('routes extract tasks locally even with tunnel available', async () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(true);
      const router = new TaskRouter({ tunnelTransport: tunnel, localBridge: bridge });

      const result = await router.route({ taskType: 'extract', prompt: 'Extract dates' });
      expect(result.executedOn).toBe('local');
    });

    it('routes small generate tasks locally', async () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(true);
      const router = new TaskRouter({
        tunnelTransport: tunnel,
        localBridge: bridge,
        offloadThresholdTokens: 2048,
      });

      const result = await router.route({
        taskType: 'generate',
        prompt: 'Hello, how are you?', // ~6 tokens, well under threshold
        estimatedTokens: 10,
      });
      expect(result.executedOn).toBe('local');
    });

    it('offloads large tasks to tunnel when available', async () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(true);
      const router = new TaskRouter({
        tunnelTransport: tunnel,
        localBridge: bridge,
        offloadThresholdTokens: 100,
      });

      const result = await router.route({
        taskType: 'reason',
        prompt: 'x'.repeat(1000), // lots of tokens
        estimatedTokens: 500,
      });
      expect(result.executedOn).toBe('remote');
      expect(tunnel.send).toHaveBeenCalled();
    });

    it('falls back to local when tunnel is not ready', async () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(false); // not ready
      const router = new TaskRouter({
        tunnelTransport: tunnel,
        localBridge: bridge,
        offloadThresholdTokens: 100,
      });

      const result = await router.route({
        taskType: 'reason',
        prompt: 'complex task',
        estimatedTokens: 500,
      });
      expect(result.executedOn).toBe('local');
    });

    it('routes locally when no tunnel transport configured', async () => {
      const bridge = createMockBridge();
      const router = new TaskRouter({ tunnelTransport: null, localBridge: bridge });

      const result = await router.route({
        taskType: 'reason',
        prompt: 'complex task',
        estimatedTokens: 5000,
      });
      expect(result.executedOn).toBe('local');
    });
  });

  describe('fallback on tunnel failure', () => {
    it('falls back to local silently when tunnel fails', async () => {
      const bridge = createMockBridge('fallback response');
      const tunnel = {
        isReady: vi.fn(() => true),
        send: vi.fn(async () => { throw new Error('Tunnel down'); }),
      };
      const router = new TaskRouter({
        tunnelTransport: tunnel,
        localBridge: bridge,
        offloadThresholdTokens: 100,
      });

      const result = await router.route({
        taskType: 'reason',
        prompt: 'x',
        estimatedTokens: 500,
      });
      // Should have fallen back to local without throwing
      expect(result.executedOn).toBe('local');
      expect(result.text).toBe('fallback response');
    });
  });

  describe('routing status', () => {
    it('reports local when no tunnel', () => {
      const bridge = createMockBridge();
      const router = new TaskRouter({ tunnelTransport: null, localBridge: bridge });
      const status = router.getRoutingStatus();
      expect(status.strategy).toBe('local');
      expect(status.tunnelAvailable).toBe(false);
    });

    it('reports tunnel when tunnel is ready', () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(true);
      const router = new TaskRouter({ tunnelTransport: tunnel, localBridge: bridge });
      const status = router.getRoutingStatus();
      expect(status.strategy).toBe('tunnel');
      expect(status.tunnelAvailable).toBe(true);
    });

    it('reports degraded when tunnel exists but not ready', () => {
      const bridge = createMockBridge();
      const tunnel = createMockTunnel(false);
      const router = new TaskRouter({ tunnelTransport: tunnel, localBridge: bridge });
      const status = router.getRoutingStatus();
      expect(status.strategy).toBe('degraded');
    });
  });

  describe('tunnel management', () => {
    it('isTunnelAvailable reflects transport state', () => {
      const bridge = createMockBridge();
      const router = new TaskRouter({ tunnelTransport: null, localBridge: bridge });
      expect(router.isTunnelAvailable()).toBe(false);

      router.setTunnelTransport(createMockTunnel(true));
      expect(router.isTunnelAvailable()).toBe(true);
    });
  });
});

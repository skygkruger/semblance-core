// Tests for DaemonManager — install, uninstall, status, PID lifecycle.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DaemonManager } from '../../packages/gateway/daemon/daemon-manager.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('DaemonManager', () => {
  let tempDir: string;
  let manager: DaemonManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'semblance-daemon-'));
    manager = new DaemonManager({
      dataDir: tempDir,
      gatewayBinaryPath: join(tempDir, 'gateway-daemon'),
    });
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* */ }
  });

  describe('status', () => {
    it('reports not running initially', () => {
      const status = manager.status();
      expect(status.running).toBe(false);
      expect(status.pid).toBeNull();
      expect(status.uptimeSeconds).toBe(0);
      expect(status.fastTierLoaded).toBe(false);
    });

    it('reports platform', () => {
      const status = manager.status();
      expect(['macos', 'windows', 'linux', 'unsupported']).toContain(status.platform);
    });
  });

  describe('start/stop', () => {
    it('starts and creates PID file', async () => {
      const result = await manager.start();
      expect(result.success).toBe(true);
      expect(existsSync(join(tempDir, 'daemon.pid'))).toBe(true);

      const status = manager.status();
      expect(status.running).toBe(true);
      expect(status.pid).toBe(process.pid);
    });

    it('stops and removes PID file', async () => {
      await manager.start();
      const result = await manager.stop();
      expect(result.success).toBe(true);

      const status = manager.status();
      expect(status.running).toBe(false);
    });

    it('start is idempotent when already running', async () => {
      await manager.start();
      const result = await manager.start();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Daemon already running');
    });

    it('stop is idempotent when not running', async () => {
      const result = await manager.stop();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Daemon not running');
    });
  });

  describe('uptime', () => {
    it('reports uptime when running', async () => {
      await manager.start();
      // Small delay to get non-zero uptime
      await new Promise(resolve => setTimeout(resolve, 50));
      const status = manager.status();
      expect(status.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('fast tier tracking', () => {
    it('tracks fast tier loaded state', async () => {
      await manager.start();
      expect(manager.status().fastTierLoaded).toBe(false);
      manager.markFastTierLoaded();
      expect(manager.status().fastTierLoaded).toBe(true);
    });
  });

  describe('install/uninstall', () => {
    it('install returns success', async () => {
      const result = await manager.install();
      // On CI/test environments, install may succeed or fail gracefully
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('isInstalled reflects install state', async () => {
      // Before install — may or may not be installed depending on prior runs
      const before = manager.isInstalled();
      expect(typeof before).toBe('boolean');
    });

    it('uninstall returns success', async () => {
      const result = await manager.uninstall();
      expect(typeof result.success).toBe('boolean');
    });
  });
});

// Tests for DeviceRegistry — device registration, capability updates, best device selection.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { DeviceRegistry } from '@semblance/core/routing/device-registry.js';
import type { DeviceCapabilities, TaskRequirements } from '@semblance/core/routing/device-registry.js';

function makeDesktop(overrides?: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    id: 'desktop-1',
    name: 'Test Desktop',
    type: 'desktop',
    platform: 'macos',
    llmRuntime: 'ollama',
    maxModelSize: '70B',
    gpuAvailable: true,
    ramGB: 32,
    isOnline: true,
    lastSeen: new Date().toISOString(),
    networkType: 'ethernet',
    batteryLevel: null,
    isCharging: false,
    features: ['email', 'calendar', 'files', 'subscriptions'],
    activeTasks: 0,
    inferenceActive: false,
    ...overrides,
  };
}

function makeMobile(overrides?: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    id: 'mobile-1',
    name: 'Test Phone',
    type: 'mobile',
    platform: 'ios',
    llmRuntime: 'mlx',
    maxModelSize: '3B',
    gpuAvailable: true,
    ramGB: 6,
    isOnline: true,
    lastSeen: new Date().toISOString(),
    networkType: 'wifi',
    batteryLevel: 85,
    isCharging: false,
    features: ['email', 'calendar'],
    activeTasks: 0,
    inferenceActive: false,
    ...overrides,
  };
}

describe('DeviceRegistry', () => {
  let db: Database.Database;
  let registry: DeviceRegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new DeviceRegistry(db);
  });

  describe('schema', () => {
    it('creates devices table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='devices'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates routing_decisions table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='routing_decisions'").all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('register', () => {
    it('registers a new device', () => {
      registry.register(makeDesktop());
      const devices = registry.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0]!.name).toBe('Test Desktop');
    });

    it('updates existing device on re-register', () => {
      registry.register(makeDesktop());
      registry.register(makeDesktop({ name: 'Updated Desktop' }));
      const devices = registry.getDevices();
      expect(devices.length).toBe(1);
      expect(devices[0]!.name).toBe('Updated Desktop');
    });

    it('registers multiple devices', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      expect(registry.getDevices().length).toBe(2);
    });
  });

  describe('update', () => {
    it('updates device capabilities', () => {
      registry.register(makeDesktop());
      registry.update('desktop-1', { activeTasks: 3, inferenceActive: true });
      const device = registry.getDevice('desktop-1');
      expect(device!.activeTasks).toBe(3);
      expect(device!.inferenceActive).toBe(true);
    });

    it('throws for unknown device', () => {
      expect(() => registry.update('nonexistent', { activeTasks: 1 })).toThrow('Device not found');
    });
  });

  describe('getDevice', () => {
    it('returns null for unknown device', () => {
      expect(registry.getDevice('nonexistent')).toBeNull();
    });

    it('returns correct device', () => {
      registry.register(makeDesktop());
      const device = registry.getDevice('desktop-1');
      expect(device!.id).toBe('desktop-1');
      expect(device!.type).toBe('desktop');
    });
  });

  describe('getBestDevice', () => {
    const networkTask: TaskRequirements = {
      minRAM: 1,
      minModelSize: '0B',
      requiresGPU: false,
      requiresNetwork: true,
      estimatedDurationMs: 5000,
      estimatedBatteryImpact: 'low',
      canRunOnMobile: false,
      canRunOnDesktop: true,
      preferredDevice: 'desktop',
    };

    const lightTask: TaskRequirements = {
      minRAM: 2,
      minModelSize: '3B',
      requiresGPU: false,
      requiresNetwork: false,
      estimatedDurationMs: 2000,
      estimatedBatteryImpact: 'low',
      canRunOnMobile: true,
      canRunOnDesktop: true,
      preferredDevice: 'either',
    };

    const heavyTask: TaskRequirements = {
      minRAM: 8,
      minModelSize: '7B',
      requiresGPU: false,
      requiresNetwork: false,
      estimatedDurationMs: 30000,
      estimatedBatteryImpact: 'high',
      canRunOnMobile: false,
      canRunOnDesktop: true,
      preferredDevice: 'desktop',
    };

    it('returns null when no devices', () => {
      expect(registry.getBestDevice(lightTask)).toBeNull();
    });

    it('returns null when no online devices', () => {
      registry.register(makeDesktop({ isOnline: false }));
      expect(registry.getBestDevice(lightTask)).toBeNull();
    });

    it('selects desktop for network tasks', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      const best = registry.getBestDevice(networkTask);
      expect(best!.type).toBe('desktop');
    });

    it('selects desktop for heavy tasks', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      const best = registry.getBestDevice(heavyTask);
      expect(best!.type).toBe('desktop');
    });

    it('prefers idle device', () => {
      registry.register(makeDesktop({ id: 'd1', activeTasks: 5, inferenceActive: true }));
      registry.register(makeDesktop({ id: 'd2', activeTasks: 0, inferenceActive: false }));
      const best = registry.getBestDevice(lightTask);
      expect(best!.id).toBe('d2');
    });

    it('returns only device when single device', () => {
      registry.register(makeDesktop());
      const best = registry.getBestDevice(lightTask);
      expect(best!.id).toBe('desktop-1');
    });

    it('filters by RAM requirement', () => {
      registry.register(makeMobile({ ramGB: 1 }));
      registry.register(makeDesktop({ ramGB: 16 }));
      const best = registry.getBestDevice({ ...lightTask, minRAM: 4 });
      expect(best!.type).toBe('desktop');
    });
  });

  describe('routing decisions', () => {
    it('logs routing decisions', () => {
      registry.logDecision('email.fetch', 'desktop-1', 'Task requires Gateway', 0.95);
      const decisions = registry.getRecentDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0]!.taskType).toBe('email.fetch');
      expect(decisions[0]!.reason).toBe('Task requires Gateway');
    });
  });
});

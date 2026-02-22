// Tests for TaskRouter — routing rules priority, network requirement, battery, model size, load.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { DeviceRegistry } from '@semblance/core/routing/device-registry.js';
import { TaskAssessor } from '@semblance/core/routing/task-assessor.js';
import { TaskRouter } from '@semblance/core/routing/router.js';
import type { DeviceCapabilities } from '@semblance/core/routing/device-registry.js';
import type { TaskDescription } from '@semblance/core/routing/task-assessor.js';
import type { DatabaseHandle } from '@semblance/core/platform/types.js';

function makeDesktop(overrides?: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    id: 'desktop-1',
    name: 'Desktop',
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
    features: ['email', 'calendar', 'files'],
    activeTasks: 0,
    inferenceActive: false,
    ...overrides,
  };
}

function makeMobile(overrides?: Partial<DeviceCapabilities>): DeviceCapabilities {
  return {
    id: 'mobile-1',
    name: 'Phone',
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

describe('TaskRouter', () => {
  let db: Database.Database;
  let registry: DeviceRegistry;
  let router: TaskRouter;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = new DeviceRegistry(db as unknown as DatabaseHandle);
    router = new TaskRouter(registry);
  });

  describe('basic routing', () => {
    it('returns null when no devices', () => {
      const result = router.route({
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result).toBeNull();
    });

    it('routes to only available device', () => {
      registry.register(makeDesktop());
      const result = router.route({
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result).not.toBeNull();
      expect(result!.targetDevice.id).toBe('desktop-1');
      expect(result!.confidence).toBe(1.0);
    });
  });

  describe('Rule 1: network requirement', () => {
    it('routes network tasks to desktop (has Gateway)', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      const result = router.route({
        type: 'email.fetch',
        urgency: 'immediate',
        requiresNetwork: true,
        requiresLLM: false,
      });
      expect(result!.targetDevice.type).toBe('desktop');
    });

    it('excludes mobile for network tasks', () => {
      registry.register(makeMobile());
      const result = router.route({
        type: 'email.fetch',
        urgency: 'immediate',
        requiresNetwork: true,
        requiresLLM: false,
      });
      // Mobile can't handle network tasks, so null
      expect(result).toBeNull();
    });
  });

  describe('Rule 2: model size', () => {
    it('routes to device with sufficient model capacity', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile({ maxModelSize: '3B' }));
      const result = router.route({
        type: 'meeting_prep',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
        estimatedInferenceTokens: 2000,
      });
      expect(result!.targetDevice.type).toBe('desktop');
    });
  });

  describe('Rule 3: battery', () => {
    it('penalizes low-battery mobile for background tasks', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile({ batteryLevel: 10 }));
      const result = router.route({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result!.targetDevice.type).toBe('desktop');
    });

    it('prefers charging mobile over depleted mobile', () => {
      registry.register(makeMobile({ id: 'm1', batteryLevel: 50, isCharging: true }));
      registry.register(makeMobile({ id: 'm2', batteryLevel: 50, isCharging: false }));
      const result = router.route({
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result!.targetDevice.id).toBe('m1');
    });
  });

  describe('Rule 5: current load', () => {
    it('prefers idle device over busy one', () => {
      registry.register(makeDesktop({ id: 'd1', activeTasks: 3, inferenceActive: true }));
      registry.register(makeDesktop({ id: 'd2', activeTasks: 0, inferenceActive: false }));
      const result = router.route({
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result!.targetDevice.id).toBe('d2');
    });
  });

  describe('Rule 6: urgency', () => {
    it('background tasks prefer desktop', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      const result = router.route({
        type: 'email.categorize',
        urgency: 'background',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result!.targetDevice.type).toBe('desktop');
    });
  });

  describe('Rule 7: default to desktop', () => {
    it('prefers desktop when all else equal', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      const result = router.route({
        type: 'subscription_detect',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: false,
      });
      expect(result!.targetDevice.type).toBe('desktop');
    });
  });

  describe('canHandle', () => {
    it('returns true for capable device', () => {
      registry.register(makeDesktop());
      expect(router.canHandle('desktop-1', {
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      })).toBe(true);
    });

    it('returns false for offline device', () => {
      registry.register(makeDesktop({ isOnline: false }));
      expect(router.canHandle('desktop-1', {
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      })).toBe(false);
    });

    it('returns false for unknown device', () => {
      expect(router.canHandle('nonexistent', {
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      })).toBe(false);
    });
  });

  describe('routing decision logging', () => {
    it('logs routing decisions', () => {
      registry.register(makeDesktop());
      router.route({
        type: 'email.fetch',
        urgency: 'immediate',
        requiresNetwork: true,
        requiresLLM: false,
      });
      const decisions = registry.getRecentDecisions();
      expect(decisions.length).toBe(1);
      expect(decisions[0]!.taskType).toBe('email.fetch');
    });
  });

  describe('alternatives', () => {
    it('includes alternative devices', () => {
      registry.register(makeDesktop());
      registry.register(makeMobile());
      const result = router.route({
        type: 'email.categorize',
        urgency: 'immediate',
        requiresNetwork: false,
        requiresLLM: true,
      });
      expect(result).not.toBeNull();
      // Both devices are capable, so one is target and one is alternative
      expect(result!.alternatives.length + 1).toBe(2); // target + alternatives = total devices
    });
  });
});

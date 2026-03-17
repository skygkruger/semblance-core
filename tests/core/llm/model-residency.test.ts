// Tests for ModelResidencyManager — eviction policy, idle timeout, RAM tracking.

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelResidencyManager } from '@semblance/core/llm/model-residency.js';
import { getFastTierModel, getRecommendedReasoningModel, getRecommendedVisionModel } from '@semblance/core/llm/model-registry.js';
import type { ModelRegistryEntry } from '@semblance/core/llm/model-registry.js';

describe('ModelResidencyManager', () => {
  let manager: ModelResidencyManager;

  beforeEach(() => {
    manager = new ModelResidencyManager('standard', 16384); // 16GB budget
  });

  it('starts with no loaded models', () => {
    expect(manager.getLoadedModels()).toEqual([]);
    expect(manager.getUsedRamMb()).toBe(0);
  });

  it('tracks loaded models', () => {
    const fast = getFastTierModel();
    manager.markLoaded(fast);
    expect(manager.isLoaded(fast.id)).toBe(true);
    expect(manager.getLoadedModels()).toContain(fast.id);
    expect(manager.getUsedRamMb()).toBe(fast.ramRequiredMb);
  });

  it('tracks unloaded models', () => {
    const fast = getFastTierModel();
    manager.markLoaded(fast);
    manager.markUnloaded(fast.id);
    expect(manager.isLoaded(fast.id)).toBe(false);
    expect(manager.getUsedRamMb()).toBe(0);
  });

  describe('residency policy', () => {
    it('fast tier is always-resident on all hardware', () => {
      const fast = getFastTierModel();
      for (const tier of ['constrained', 'standard', 'performance', 'workstation'] as const) {
        const mgr = new ModelResidencyManager(tier, 16384);
        expect(mgr.shouldLoadAtStartup(fast)).toBe(true);
      }
    });

    it('primary models respect tier-specific residency', () => {
      const primary = getRecommendedReasoningModel('constrained');
      // Constrained: session (not always)
      const constrained = new ModelResidencyManager('constrained', 8192);
      expect(constrained.shouldLoadAtStartup(primary)).toBe(false);
      // Standard: always
      const standard = new ModelResidencyManager('standard', 16384);
      expect(standard.shouldLoadAtStartup(primary)).toBe(true);
    });
  });

  describe('eviction policy', () => {
    it('returns empty when enough RAM available', () => {
      expect(manager.getEvictionCandidates(1024)).toEqual([]);
    });

    it('never evicts fast tier models', () => {
      const fast = getFastTierModel();
      const primary = getRecommendedReasoningModel('standard');
      manager.markLoaded(fast);
      manager.markLoaded(primary);

      // Try to evict more than available
      const candidates = manager.getEvictionCandidates(20000);
      expect(candidates).not.toContain(fast.id);
    });

    it('evicts vision before primary', () => {
      // Use a small RAM budget to force eviction
      const smallManager = new ModelResidencyManager('standard', 4096);
      const primary = getRecommendedReasoningModel('standard');
      const vision = getRecommendedVisionModel('standard');
      if (!vision) return; // skip if no vision model for tier

      smallManager.markLoaded(primary);
      smallManager.markLoaded(vision);

      // Need to evict something — request more than available
      const totalUsed = primary.ramRequiredMb + vision.ramRequiredMb;
      const candidates = smallManager.getEvictionCandidates(totalUsed + 1);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0]).toBe(vision.id); // vision evicted first
    });

    it('evicts least recently used within same tier', () => {
      // Use a small RAM budget to force eviction
      const smallManager = new ModelResidencyManager('standard', 2048);
      const model1 = getRecommendedReasoningModel('constrained');
      const model2 = getRecommendedReasoningModel('standard');

      smallManager.markLoaded(model1);
      smallManager.markLoaded(model2);

      // Use model2 more recently
      smallManager.markUsed(model2.id);

      // Request more than available to trigger eviction
      const totalUsed = model1.ramRequiredMb + model2.ramRequiredMb;
      const candidates = smallManager.getEvictionCandidates(totalUsed + 1);
      expect(candidates.length).toBeGreaterThan(0);
      // model1 should be evicted first (older lastUsedAt)
      expect(candidates[0]).toBe(model1.id);
    });
  });

  describe('idle eviction', () => {
    it('returns empty when no models have idle timeout', () => {
      const fast = getFastTierModel();
      manager.markLoaded(fast);
      expect(manager.getIdleEvictions()).toEqual([]);
    });

    it('detects idle models on constrained hardware', () => {
      const constrainedMgr = new ModelResidencyManager('constrained', 8192);
      const primary = getRecommendedReasoningModel('constrained');

      constrainedMgr.markLoaded(primary);

      // Simulate time passage by manipulating the loaded model's lastUsedAt
      const loaded = (constrainedMgr as any).loaded as Map<string, any>;
      const entry = loaded.get(primary.id);
      if (entry && primary.idleEvictAfterSeconds) {
        entry.lastUsedAt = Date.now() - (primary.idleEvictAfterSeconds + 1) * 1000;
      }

      const evictions = constrainedMgr.getIdleEvictions();
      if (primary.idleEvictAfterSeconds) {
        expect(evictions).toContain(primary.id);
      }
    });
  });
});

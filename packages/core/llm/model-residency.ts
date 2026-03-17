// Model Residency Manager — Tracks loaded models and enforces eviction policy.
// Works with InferenceRouter to manage memory across three inference tiers.
// CRITICAL: No network imports. Pure state management.

import type { HardwareProfileTier } from './hardware-types.js';
import type { ModelRegistryEntry, ResidencyPolicy } from './model-registry.js';

interface LoadedModel {
  modelId: string;
  entry: ModelRegistryEntry;
  loadedAt: number;
  lastUsedAt: number;
  ramMb: number;
}

/**
 * ModelResidencyManager tracks which models are currently loaded in memory
 * and enforces eviction policy based on hardware tier and model tier.
 *
 * Eviction priority (lowest evicted first):
 *   1. Fast tier is NEVER evicted
 *   2. Embedding tier is NEVER evicted
 *   3. Vision tier evicts before primary
 *   4. Idle primary evicts before active primary
 */
export class ModelResidencyManager {
  private loaded: Map<string, LoadedModel> = new Map();
  private hardwareTier: HardwareProfileTier;
  private totalRamBudgetMb: number;

  constructor(hardwareTier: HardwareProfileTier, totalRamBudgetMb: number) {
    this.hardwareTier = hardwareTier;
    this.totalRamBudgetMb = totalRamBudgetMb;
  }

  /**
   * Check the residency policy for a model on this hardware tier.
   */
  getResidency(entry: ModelRegistryEntry): 'always' | 'session' | 'on-demand' {
    return entry.residencyPolicy[this.hardwareTier];
  }

  /**
   * Should this model be loaded at daemon startup?
   */
  shouldLoadAtStartup(entry: ModelRegistryEntry): boolean {
    return this.getResidency(entry) === 'always';
  }

  /**
   * Mark a model as loaded.
   */
  markLoaded(entry: ModelRegistryEntry): void {
    const now = Date.now();
    this.loaded.set(entry.id, {
      modelId: entry.id,
      entry,
      loadedAt: now,
      lastUsedAt: now,
      ramMb: entry.ramRequiredMb,
    });
  }

  /**
   * Mark a model as used (updates lastUsedAt for idle eviction).
   */
  markUsed(modelId: string): void {
    const model = this.loaded.get(modelId);
    if (model) {
      model.lastUsedAt = Date.now();
    }
  }

  /**
   * Mark a model as unloaded.
   */
  markUnloaded(modelId: string): void {
    this.loaded.delete(modelId);
  }

  /**
   * Get all currently loaded model IDs.
   */
  getLoadedModels(): string[] {
    return Array.from(this.loaded.keys());
  }

  /**
   * Check if a specific model is loaded.
   */
  isLoaded(modelId: string): boolean {
    return this.loaded.has(modelId);
  }

  /**
   * Get total RAM used by loaded models.
   */
  getUsedRamMb(): number {
    let total = 0;
    for (const model of this.loaded.values()) {
      total += model.ramMb;
    }
    return total;
  }

  /**
   * Get models that should be evicted to make room for a new model.
   * Returns model IDs in eviction priority order (lowest priority first).
   * Never evicts fast tier or embedding tier models.
   */
  getEvictionCandidates(neededRamMb: number): string[] {
    const available = this.totalRamBudgetMb - this.getUsedRamMb();
    if (available >= neededRamMb) return []; // No eviction needed

    const candidates: LoadedModel[] = [];
    for (const model of this.loaded.values()) {
      // Never evict fast tier or embedding
      if (model.entry.inferenceTier === 'fast' || model.entry.inferenceTier === 'embedding') {
        continue;
      }
      candidates.push(model);
    }

    // Sort by eviction priority: vision before primary, idle before active
    candidates.sort((a, b) => {
      // Vision models evict before primary
      const tierPriority = (m: LoadedModel) =>
        m.entry.inferenceTier === 'vision' ? 0 : 1;
      const tierDiff = tierPriority(a) - tierPriority(b);
      if (tierDiff !== 0) return tierDiff;

      // Within same tier: least recently used first
      return a.lastUsedAt - b.lastUsedAt;
    });

    // Collect enough candidates to free the needed RAM
    const toEvict: string[] = [];
    let freed = 0;
    for (const candidate of candidates) {
      toEvict.push(candidate.modelId);
      freed += candidate.ramMb;
      if (available + freed >= neededRamMb) break;
    }

    return toEvict;
  }

  /**
   * Check if any loaded models have exceeded their idle eviction timeout.
   * Returns model IDs that should be evicted due to idle timeout.
   */
  getIdleEvictions(): string[] {
    const now = Date.now();
    const toEvict: string[] = [];

    for (const model of this.loaded.values()) {
      const evictAfter = model.entry.idleEvictAfterSeconds;
      if (evictAfter === undefined) continue;

      // Only apply idle eviction on constrained hardware for session-resident models
      if (this.getResidency(model.entry) !== 'session') continue;

      const idleMs = now - model.lastUsedAt;
      if (idleMs > evictAfter * 1000) {
        toEvict.push(model.modelId);
      }
    }

    return toEvict;
  }

  /**
   * Get the hardware tier this manager is configured for.
   */
  getHardwareTier(): HardwareProfileTier {
    return this.hardwareTier;
  }
}

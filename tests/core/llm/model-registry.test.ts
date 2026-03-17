// Tests for Model Registry — catalog lookups, tier mapping, size calculation, three-tier architecture.

import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG,
  BITNET_MODEL_CATALOG,
  getRecommendedReasoningModel,
  getEmbeddingModel,
  getModelsForTier,
  getModelById,
  getTotalDownloadSize,
  formatBytes,
  getFastTierModel,
  getRecommendedBitNetModel,
  getVisionModelsForTier,
  getRecommendedVisionModel,
  getRichVisionModel,
  getAnyModelById,
  getAllReasoningModelsForTier,
} from '@semblance/core/llm/model-registry.js';
import type { HardwareProfileTier } from '@semblance/core/llm/hardware-types.js';

describe('MODEL_CATALOG', () => {
  it('has at least one embedding model', () => {
    const embedding = MODEL_CATALOG.filter(m => m.isEmbedding);
    expect(embedding.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least one reasoning model per tier', () => {
    const tiers: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
    for (const tier of tiers) {
      const model = getRecommendedReasoningModel(tier);
      expect(model).toBeDefined();
      expect(model.isEmbedding).toBe(false);
    }
  });

  it('all entries have required fields including new tier fields', () => {
    for (const entry of MODEL_CATALOG) {
      expect(entry.id).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.family).toBeTruthy();
      expect(entry.hfRepo).toBeTruthy();
      expect(entry.hfFilename).toBeTruthy();
      expect(entry.fileSizeBytes).toBeGreaterThan(0);
      expect(entry.ramRequiredMb).toBeGreaterThan(0);
      expect(entry.inferenceTier).toBeTruthy();
      expect(entry.modality).toBeTruthy();
      expect(entry.residencyPolicy).toBeDefined();
      expect(entry.residencyPolicy.constrained).toBeTruthy();
      expect(entry.residencyPolicy.standard).toBeTruthy();
      expect(entry.residencyPolicy.performance).toBeTruthy();
      expect(entry.residencyPolicy.workstation).toBeTruthy();
    }
  });

  it('all BitNet entries have required tier fields', () => {
    for (const entry of BITNET_MODEL_CATALOG) {
      expect(entry.inferenceTier).toBe('primary');
      expect(entry.modality).toBe('text');
      expect(entry.residencyPolicy).toBeDefined();
    }
  });
});

describe('Three-Tier Architecture', () => {
  it('has exactly one fast tier model (SmolLM2)', () => {
    const fastModels = MODEL_CATALOG.filter(m => m.inferenceTier === 'fast');
    expect(fastModels).toHaveLength(1);
    expect(fastModels[0]!.family).toBe('smollm2');
  });

  it('fast tier model is always-resident on all hardware tiers', () => {
    const fast = getFastTierModel();
    expect(fast.residencyPolicy.constrained).toBe('always');
    expect(fast.residencyPolicy.standard).toBe('always');
    expect(fast.residencyPolicy.performance).toBe('always');
    expect(fast.residencyPolicy.workstation).toBe('always');
  });

  it('has primary tier Qwen3 models for each hardware tier', () => {
    const primaryModels = MODEL_CATALOG.filter(m => m.inferenceTier === 'primary' && m.family === 'qwen3');
    expect(primaryModels.length).toBe(4);
    expect(primaryModels.some(m => m.minTier === 'constrained')).toBe(true);
    expect(primaryModels.some(m => m.minTier === 'standard')).toBe(true);
    expect(primaryModels.some(m => m.minTier === 'performance')).toBe(true);
    expect(primaryModels.some(m => m.minTier === 'workstation')).toBe(true);
  });

  it('has vision tier models', () => {
    const visionModels = MODEL_CATALOG.filter(m => m.inferenceTier === 'vision');
    expect(visionModels.length).toBe(2);
    expect(visionModels.some(m => m.family === 'moondream')).toBe(true);
    expect(visionModels.some(m => m.family === 'qwen2.5-vl')).toBe(true);
  });

  it('vision models have mmProjector fields', () => {
    const visionModels = MODEL_CATALOG.filter(m => m.modality === 'vision');
    for (const m of visionModels) {
      expect(m.mmProjectorFilename).toBeTruthy();
      expect(m.mmProjectorSizeBytes).toBeGreaterThan(0);
    }
  });

  it('no Qwen2.5 reasoning models remain in catalog', () => {
    const qwen25 = MODEL_CATALOG.filter(m => m.family === 'qwen2' && !m.isEmbedding);
    expect(qwen25).toHaveLength(0);
  });
});

describe('getFastTierModel', () => {
  it('returns SmolLM2', () => {
    const fast = getFastTierModel();
    expect(fast.id).toBe('smollm2-1.7b-instruct-q4_k_m');
    expect(fast.inferenceTier).toBe('fast');
    expect(fast.contextLength).toBe(8192);
  });
});

describe('getEmbeddingModel', () => {
  it('returns the nomic-embed-text model', () => {
    const model = getEmbeddingModel();
    expect(model.isEmbedding).toBe(true);
    expect(model.embeddingDimensions).toBe(768);
    expect(model.id).toContain('nomic-embed');
  });

  it('768-dim embedding model is the same for all tiers (locked decision)', () => {
    const model = getEmbeddingModel();
    expect(model.embeddingDimensions).toBe(768);
    expect(model.minTier).toBe('constrained');
  });
});

describe('getRecommendedReasoningModel', () => {
  it('constrained tier gets Qwen3 1.7B', () => {
    const model = getRecommendedReasoningModel('constrained');
    expect(model.parameterCount).toBe('1.7B');
    expect(model.family).toBe('qwen3');
  });

  it('standard tier gets Qwen3 4B', () => {
    const model = getRecommendedReasoningModel('standard');
    expect(model.parameterCount).toBe('4B');
    expect(model.family).toBe('qwen3');
  });

  it('performance tier gets Qwen3 8B', () => {
    const model = getRecommendedReasoningModel('performance');
    expect(model.parameterCount).toBe('8B');
    expect(model.family).toBe('qwen3');
  });

  it('workstation tier gets Qwen3 30B MoE', () => {
    const model = getRecommendedReasoningModel('workstation');
    expect(model.parameterCount).toBe('30B (3B active)');
    expect(model.family).toBe('qwen3');
  });

  it('higher tiers get larger models', () => {
    const constrained = getRecommendedReasoningModel('constrained');
    const standard = getRecommendedReasoningModel('standard');
    const performance = getRecommendedReasoningModel('performance');
    const workstation = getRecommendedReasoningModel('workstation');

    expect(constrained.fileSizeBytes).toBeLessThan(standard.fileSizeBytes);
    expect(standard.fileSizeBytes).toBeLessThan(performance.fileSizeBytes);
    expect(performance.fileSizeBytes).toBeLessThanOrEqual(workstation.fileSizeBytes);
  });
});

describe('getRecommendedBitNetModel', () => {
  it('constrained default is Falcon3 1B (NOT Falcon-E 1B)', () => {
    const model = getRecommendedBitNetModel('constrained');
    expect(model.id).toBe('falcon3-1b-instruct-1.58bit');
    expect(model.contextLength).toBe(8192);
  });

  it('standard default is Falcon-E 3B', () => {
    const model = getRecommendedBitNetModel('standard');
    expect(model.id).toBe('falcon-e-3b');
  });

  it('performance default is Falcon3 7B', () => {
    const model = getRecommendedBitNetModel('performance');
    expect(model.id).toBe('falcon3-7b-instruct-1.58bit');
  });

  it('workstation default is Falcon3 10B', () => {
    const model = getRecommendedBitNetModel('workstation');
    expect(model.id).toBe('falcon3-10b-instruct-1.58bit');
  });

  it('Falcon-E 1B still exists in catalog (for Settings)', () => {
    const found = BITNET_MODEL_CATALOG.find(m => m.id === 'falcon-e-1b');
    expect(found).toBeDefined();
  });
});

describe('Vision model lookups', () => {
  it('getVisionModelsForTier returns Moondream2 for constrained', () => {
    const models = getVisionModelsForTier('constrained');
    expect(models.length).toBeGreaterThanOrEqual(1);
    expect(models[0]!.family).toBe('moondream');
  });

  it('getVisionModelsForTier returns both models for standard+', () => {
    const models = getVisionModelsForTier('standard');
    expect(models.length).toBe(2);
  });

  it('getRecommendedVisionModel returns Moondream2', () => {
    const model = getRecommendedVisionModel('standard');
    expect(model).not.toBeNull();
    expect(model!.family).toBe('moondream');
  });

  it('getRichVisionModel returns Qwen2.5-VL for standard+', () => {
    const model = getRichVisionModel('standard');
    expect(model).not.toBeNull();
    expect(model!.family).toBe('qwen2.5-vl');
  });

  it('getRichVisionModel returns null for constrained', () => {
    const model = getRichVisionModel('constrained');
    expect(model).toBeNull();
  });
});

describe('getModelsForTier', () => {
  it('returns exactly 2 models (reasoning + embedding)', () => {
    const tiers: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
    for (const tier of tiers) {
      const models = getModelsForTier(tier);
      expect(models).toHaveLength(2);
      expect(models.filter(m => m.isEmbedding)).toHaveLength(1);
      expect(models.filter(m => !m.isEmbedding)).toHaveLength(1);
    }
  });
});

describe('getModelById', () => {
  it('finds existing model', () => {
    const model = getModelById('nomic-embed-text-v1.5-q8_0');
    expect(model).not.toBeNull();
    expect(model!.isEmbedding).toBe(true);
  });

  it('finds SmolLM2 fast tier model', () => {
    const model = getModelById('smollm2-1.7b-instruct-q4_k_m');
    expect(model).not.toBeNull();
    expect(model!.inferenceTier).toBe('fast');
  });

  it('returns null for unknown model', () => {
    expect(getModelById('nonexistent-model')).toBeNull();
  });
});

describe('getAnyModelById', () => {
  it('finds standard catalog model', () => {
    const model = getAnyModelById('smollm2-1.7b-instruct-q4_k_m');
    expect(model).not.toBeNull();
  });

  it('finds BitNet catalog model', () => {
    const model = getAnyModelById('falcon3-1b-instruct-1.58bit');
    expect(model).not.toBeNull();
  });
});

describe('getAllReasoningModelsForTier', () => {
  it('returns both standard and BitNet models', () => {
    const models = getAllReasoningModelsForTier('standard');
    const hasBitNet = models.some(m => m.inferenceBackend === 'bitnet');
    const hasStandard = models.some(m => !m.inferenceBackend || m.inferenceBackend === 'llama');
    expect(hasBitNet).toBe(true);
    expect(hasStandard).toBe(true);
  });
});

describe('getTotalDownloadSize', () => {
  it('returns positive size for all tiers', () => {
    const tiers: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
    for (const tier of tiers) {
      const size = getTotalDownloadSize(tier);
      expect(size).toBeGreaterThan(0);
    }
  });

  it('constrained tier has smallest total download', () => {
    const constrained = getTotalDownloadSize('constrained');
    const workstation = getTotalDownloadSize('workstation');
    expect(constrained).toBeLessThan(workstation);
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(275_000_000)).toContain('MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(4_700_000_000)).toContain('GB');
  });
});

describe('Residency policies', () => {
  it('fast tier is always-resident everywhere', () => {
    const fast = getFastTierModel();
    expect(fast.residencyPolicy.constrained).toBe('always');
    expect(fast.residencyPolicy.standard).toBe('always');
    expect(fast.residencyPolicy.performance).toBe('always');
    expect(fast.residencyPolicy.workstation).toBe('always');
  });

  it('Qwen3 1.7B has idle eviction on constrained', () => {
    const model = getRecommendedReasoningModel('constrained');
    expect(model.idleEvictAfterSeconds).toBe(300);
    expect(model.residencyPolicy.constrained).toBe('session');
  });

  it('Qwen3 30B is session-resident only on workstation', () => {
    const model = getModelById('qwen3-30b-a3b-q4_k_m');
    expect(model).not.toBeNull();
    expect(model!.residencyPolicy.workstation).toBe('session');
    expect(model!.residencyPolicy.performance).toBe('on-demand');
  });
});

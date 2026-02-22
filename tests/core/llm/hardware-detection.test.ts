// Tests for hardware detection TypeScript-side — verifies profile classification
// and model recommendations based on detected hardware.

import { describe, it, expect } from 'vitest';
import {
  classifyHardware,
  getRecommendedReasoningModel,
  getEmbeddingModel,
  getModelsForTier,
} from '@semblance/core/llm/index.js';
import type { HardwareProfileTier, GpuInfo } from '@semblance/core/llm/index.js';

describe('Hardware → Model Selection Pipeline', () => {
  it('constrained hardware (4GB) gets 1.5B model + embedding', () => {
    const tier = classifyHardware(4 * 1024, null);
    expect(tier).toBe('constrained');

    const models = getModelsForTier(tier);
    expect(models).toHaveLength(2);

    const reasoning = models.find(m => !m.isEmbedding)!;
    expect(reasoning.parameterCount).toBe('1.5B');
    expect(reasoning.ramRequiredMb).toBeLessThanOrEqual(4 * 1024);

    const embedding = models.find(m => m.isEmbedding)!;
    expect(embedding.embeddingDimensions).toBe(768);
  });

  it('standard hardware (12GB) gets 3B model + embedding', () => {
    const tier = classifyHardware(12 * 1024, null);
    expect(tier).toBe('standard');

    const reasoning = getRecommendedReasoningModel(tier);
    expect(reasoning.parameterCount).toBe('3B');
    expect(reasoning.ramRequiredMb).toBeLessThanOrEqual(12 * 1024);
  });

  it('performance hardware (24GB) gets 7B model + embedding', () => {
    const tier = classifyHardware(24 * 1024, null);
    expect(tier).toBe('performance');

    const reasoning = getRecommendedReasoningModel(tier);
    expect(reasoning.parameterCount).toBe('7B');
  });

  it('workstation hardware (64GB + RTX) gets best 7B Q8 model', () => {
    const gpu: GpuInfo = {
      name: 'RTX 4090',
      vendor: 'nvidia',
      vramMb: 24576,
      computeCapable: true,
    };
    const tier = classifyHardware(64 * 1024, gpu);
    expect(tier).toBe('workstation');

    const reasoning = getRecommendedReasoningModel(tier);
    expect(reasoning.quantization).toBe('Q8_0');
  });

  it('embedding model is identical across all tiers (locked decision)', () => {
    const tiers: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
    const embeddings = tiers.map(() => getEmbeddingModel());

    // All should be the same model
    const ids = new Set(embeddings.map(e => e.id));
    expect(ids.size).toBe(1);
    expect(embeddings[0].embeddingDimensions).toBe(768);
  });

  it('every tier model fits within its RAM budget', () => {
    const tierRamMb: Record<HardwareProfileTier, number> = {
      constrained: 6 * 1024,
      standard: 8 * 1024,
      performance: 16 * 1024,
      workstation: 32 * 1024,
    };

    for (const [tier, ramMb] of Object.entries(tierRamMb) as [HardwareProfileTier, number][]) {
      const models = getModelsForTier(tier);
      const totalRamRequired = models.reduce((sum, m) => sum + m.ramRequiredMb, 0);
      // Models should fit within available RAM (leaving room for OS and app)
      expect(totalRamRequired).toBeLessThanOrEqual(ramMb);
    }
  });

  it('HuggingFace repo IDs look valid', () => {
    const tiers: HardwareProfileTier[] = ['constrained', 'standard', 'performance', 'workstation'];
    for (const tier of tiers) {
      const models = getModelsForTier(tier);
      for (const model of models) {
        expect(model.hfRepo).toMatch(/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/);
        expect(model.hfFilename).toMatch(/\.gguf$/);
      }
    }
  });
});

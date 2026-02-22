// Tests for Model Registry — catalog lookups, tier mapping, size calculation.

import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG,
  getRecommendedReasoningModel,
  getEmbeddingModel,
  getModelsForTier,
  getModelById,
  getTotalDownloadSize,
  formatBytes,
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

  it('all entries have required fields', () => {
    for (const entry of MODEL_CATALOG) {
      expect(entry.id).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.family).toBeTruthy();
      expect(entry.hfRepo).toBeTruthy();
      expect(entry.hfFilename).toBeTruthy();
      expect(entry.fileSizeBytes).toBeGreaterThan(0);
      expect(entry.ramRequiredMb).toBeGreaterThan(0);
    }
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
    // This is the LOCKED DECISION test — embedding model must NOT vary by tier
    const model = getEmbeddingModel();
    expect(model.embeddingDimensions).toBe(768);
    expect(model.minTier).toBe('constrained'); // available for all tiers
  });
});

describe('getRecommendedReasoningModel', () => {
  it('constrained tier gets smallest reasoning model', () => {
    const model = getRecommendedReasoningModel('constrained');
    expect(model.parameterCount).toBe('1.5B');
  });

  it('standard tier gets 3B model', () => {
    const model = getRecommendedReasoningModel('standard');
    expect(model.parameterCount).toBe('3B');
  });

  it('performance tier gets 7B model', () => {
    const model = getRecommendedReasoningModel('performance');
    expect(model.parameterCount).toBe('7B');
  });

  it('workstation tier gets highest quality 7B model', () => {
    const model = getRecommendedReasoningModel('workstation');
    expect(model.parameterCount).toBe('7B');
    expect(model.quantization).toBe('Q8_0');
  });

  it('higher tiers get larger or higher quality models', () => {
    const constrained = getRecommendedReasoningModel('constrained');
    const standard = getRecommendedReasoningModel('standard');
    const performance = getRecommendedReasoningModel('performance');
    const workstation = getRecommendedReasoningModel('workstation');

    expect(constrained.fileSizeBytes).toBeLessThan(standard.fileSizeBytes);
    expect(standard.fileSizeBytes).toBeLessThan(performance.fileSizeBytes);
    expect(performance.fileSizeBytes).toBeLessThanOrEqual(workstation.fileSizeBytes);
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

  it('returns null for unknown model', () => {
    expect(getModelById('nonexistent-model')).toBeNull();
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

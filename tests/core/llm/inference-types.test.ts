// Tests for Inference Types — task-to-tier mapping, fallback chains.

import { describe, it, expect } from 'vitest';
import {
  TASK_TIER_MAP,
  TIER_FALLBACK_CHAIN,
} from '@semblance/core/llm/inference-types.js';
import type { TaskType, InferenceTier } from '@semblance/core/llm/inference-types.js';

describe('TASK_TIER_MAP', () => {
  it('maps all task types to tiers', () => {
    const taskTypes: TaskType[] = ['generate', 'classify', 'extract', 'embed', 'reason', 'draft'];
    for (const task of taskTypes) {
      expect(TASK_TIER_MAP[task]).toBeDefined();
    }
  });

  it('classify maps to fast tier', () => {
    expect(TASK_TIER_MAP.classify).toBe('fast');
  });

  it('reason maps to quality tier', () => {
    expect(TASK_TIER_MAP.reason).toBe('quality');
  });

  it('embed maps to embedding tier', () => {
    expect(TASK_TIER_MAP.embed).toBe('embedding');
  });

  it('generate maps to primary tier', () => {
    expect(TASK_TIER_MAP.generate).toBe('primary');
  });

  it('extract maps to primary tier', () => {
    expect(TASK_TIER_MAP.extract).toBe('primary');
  });

  it('draft maps to primary tier', () => {
    expect(TASK_TIER_MAP.draft).toBe('primary');
  });
});

describe('TIER_FALLBACK_CHAIN', () => {
  it('defines fallback for all tiers', () => {
    const tiers: InferenceTier[] = ['fast', 'primary', 'quality', 'embedding'];
    for (const tier of tiers) {
      expect(TIER_FALLBACK_CHAIN[tier]).toBeDefined();
      expect(TIER_FALLBACK_CHAIN[tier].length).toBeGreaterThan(0);
    }
  });

  it('quality falls back through primary to fast', () => {
    expect(TIER_FALLBACK_CHAIN.quality).toEqual(['quality', 'primary', 'fast']);
  });

  it('primary falls back to fast', () => {
    expect(TIER_FALLBACK_CHAIN.primary).toEqual(['primary', 'fast']);
  });

  it('fast has no fallback beyond itself', () => {
    expect(TIER_FALLBACK_CHAIN.fast).toEqual(['fast']);
  });

  it('embedding has no fallback (required)', () => {
    expect(TIER_FALLBACK_CHAIN.embedding).toEqual(['embedding']);
  });

  it('every chain starts with the tier itself', () => {
    const tiers: InferenceTier[] = ['fast', 'primary', 'quality', 'embedding'];
    for (const tier of tiers) {
      expect(TIER_FALLBACK_CHAIN[tier][0]).toBe(tier);
    }
  });
});

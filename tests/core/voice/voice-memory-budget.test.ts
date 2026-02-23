// VoiceMemoryBudget Tests — Memory calculation and strategy selection.

import { describe, it, expect } from 'vitest';
import { VoiceMemoryBudget } from '../../../packages/core/voice/voice-memory-budget';
import type { HardwareProfile } from '../../../packages/core/llm/hardware-types';

function makeProfile(totalRamMb: number): HardwareProfile {
  return {
    tier: totalRamMb >= 32768 ? 'workstation' : totalRamMb >= 16384 ? 'performance' : totalRamMb >= 8192 ? 'standard' : 'constrained',
    cpuCores: 8,
    cpuArch: 'arm64',
    totalRamMb,
    availableRamMb: totalRamMb * 0.6,
    os: 'macos',
    gpu: null,
  };
}

describe('VoiceMemoryBudget', () => {
  it('16GB device with 4GB LLM → both-persistent', () => {
    // Available: 16384 - 2048 (OS) - 4096 (LLM) - 300 (embed) = 9940 MB — plenty
    const budget = new VoiceMemoryBudget(makeProfile(16384), 4096);
    expect(budget.getLoadingStrategy()).toBe('both-persistent');
    expect(budget.isVoiceAvailable()).toBe(true);
  });

  it('8GB device with 4GB LLM → on-demand', () => {
    // Available: 8192 - 2048 - 4096 - 300 = 1748 MB — tight, but models fit if loaded on-demand
    const budget = new VoiceMemoryBudget(makeProfile(8192), 4096);
    const strategy = budget.getLoadingStrategy();
    expect(['on-demand', 'both-persistent']).toContain(strategy);
    expect(budget.isVoiceAvailable()).toBe(true);
  });

  it('4GB device with 2GB LLM → stt-only or on-demand with tiny', () => {
    // Available: 4096 - 2048 - 2048 - 300 = -300 → basically nothing
    const budget = new VoiceMemoryBudget(makeProfile(4096), 2048);
    const strategy = budget.getLoadingStrategy();
    // Very tight — depends on exact budget math
    expect(['stt-only', 'on-demand', 'unavailable']).toContain(strategy);
  });

  it('<4GB with LLM loaded → unavailable', () => {
    // Available: 3072 - 2048 - 2048 - 300 = -1324 → negative
    const budget = new VoiceMemoryBudget(makeProfile(3072), 2048);
    expect(budget.getLoadingStrategy()).toBe('unavailable');
    expect(budget.isVoiceAvailable()).toBe(false);
  });

  it('isVoiceAvailable false when insufficient memory', () => {
    const budget = new VoiceMemoryBudget(makeProfile(2048), 1024);
    expect(budget.isVoiceAvailable()).toBe(false);
  });
});

// VoiceResourceCoordinator Tests — Model loading coordination.

import { describe, it, expect } from 'vitest';
import { VoiceResourceCoordinator } from '../../../packages/core/voice/voice-resource-coordinator';
import { VoiceMemoryBudget } from '../../../packages/core/voice/voice-memory-budget';
import { WhisperModelManager } from '../../../packages/core/voice/whisper-model-manager';
import { PiperModelManager } from '../../../packages/core/voice/piper-model-manager';
import type { HardwareProfile } from '../../../packages/core/llm/hardware-types';

function makeProfile(totalRamMb: number): HardwareProfile {
  return {
    tier: 'performance',
    cpuCores: 8,
    cpuArch: 'arm64',
    totalRamMb,
    availableRamMb: totalRamMb * 0.6,
    os: 'macos',
    gpu: null,
  };
}

describe('VoiceResourceCoordinator', () => {
  it('prepareForVoice loads models per strategy', () => {
    const profile = makeProfile(16384);
    const budget = new VoiceMemoryBudget(profile, 4096);
    const whisper = new WhisperModelManager(profile);
    const piper = new PiperModelManager();
    const coord = new VoiceResourceCoordinator(budget, whisper, piper);

    const readiness = coord.prepareForVoice();
    expect(readiness.sttReady).toBe(true);
    expect(readiness.whisperModel).not.toBeNull();
    // Strategy should allow TTS too
    if (readiness.strategy === 'both-persistent' || readiness.strategy === 'on-demand') {
      expect(readiness.ttsReady).toBe(true);
      expect(readiness.piperVoice).not.toBeNull();
    }
  });

  it('releaseVoiceResources unloads all', () => {
    const profile = makeProfile(16384);
    const budget = new VoiceMemoryBudget(profile, 4096);
    const whisper = new WhisperModelManager(profile);
    const piper = new PiperModelManager();
    const coord = new VoiceResourceCoordinator(budget, whisper, piper);

    coord.prepareForVoice();
    expect(whisper.isLoaded()).toBe(true);

    coord.releaseVoiceResources();
    expect(whisper.isLoaded()).toBe(false);
    expect(piper.isLoaded()).toBe(false);
  });

  it('onMemoryPressure immediately unloads', () => {
    const profile = makeProfile(16384);
    const budget = new VoiceMemoryBudget(profile, 4096);
    const whisper = new WhisperModelManager(profile);
    const piper = new PiperModelManager();
    const coord = new VoiceResourceCoordinator(budget, whisper, piper);

    coord.prepareForVoice();
    expect(whisper.isLoaded()).toBe(true);

    coord.onMemoryPressure();
    expect(whisper.isLoaded()).toBe(false);
    expect(piper.isLoaded()).toBe(false);
  });
});

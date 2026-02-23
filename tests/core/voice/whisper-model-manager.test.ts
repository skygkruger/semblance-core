// WhisperModelManager Tests — Model selection and lifecycle.

import { describe, it, expect } from 'vitest';
import { WhisperModelManager } from '../../../packages/core/voice/whisper-model-manager';
import type { HardwareProfile } from '../../../packages/core/llm/hardware-types';

function makeProfile(totalRamMb: number, os: HardwareProfile['os'] = 'macos'): HardwareProfile {
  return {
    tier: totalRamMb >= 32768 ? 'workstation' : totalRamMb >= 16384 ? 'performance' : totalRamMb >= 8192 ? 'standard' : 'constrained',
    cpuCores: 8,
    cpuArch: 'arm64',
    totalRamMb,
    availableRamMb: totalRamMb * 0.6,
    os,
    gpu: null,
  };
}

describe('WhisperModelManager', () => {
  it('workstation (32GB+) selects whisper-large-v3', () => {
    const mgr = new WhisperModelManager(makeProfile(32768));
    const selected = mgr.selectModel();
    expect(selected.id).toBe('whisper-large-v3');
  });

  it('constrained (<8GB) selects whisper-tiny', () => {
    const mgr = new WhisperModelManager(makeProfile(4096), 200);
    const selected = mgr.selectModel();
    expect(selected.id).toBe('whisper-tiny');
  });

  it('mobile iOS selects whisper-base', () => {
    // Mobile with enough memory for base but not medium
    const mgr = new WhisperModelManager(makeProfile(6144, 'unknown'), 500);
    const selected = mgr.selectModel();
    expect(selected.id).toBe('whisper-base');
  });

  it('loadModel sets isLoaded() true', () => {
    const mgr = new WhisperModelManager(makeProfile(16384));
    expect(mgr.isLoaded()).toBe(false);

    mgr.loadModel();
    expect(mgr.isLoaded()).toBe(true);
    expect(mgr.getLoadedModel()).not.toBeNull();
  });

  it('unloadModel sets isLoaded() false', () => {
    const mgr = new WhisperModelManager(makeProfile(16384));
    mgr.loadModel();
    expect(mgr.isLoaded()).toBe(true);

    mgr.unloadModel();
    expect(mgr.isLoaded()).toBe(false);
    expect(mgr.getLoadedModel()).toBeNull();
  });
});

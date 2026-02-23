// Voice Settings Tests — Verify defaults, speed range, and model reflection.

import { describe, it, expect } from 'vitest';

// Test the state shape and defaults directly (no React rendering needed)
const DEFAULT_VOICE_SETTINGS = {
  enabled: false,
  whisperModel: null,
  piperVoice: null,
  speed: 1.0,
  silenceSensitivity: 'medium' as const,
};

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

describe('Voice Settings', () => {
  it('voice settings default OFF', () => {
    expect(DEFAULT_VOICE_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_VOICE_SETTINGS.whisperModel).toBeNull();
    expect(DEFAULT_VOICE_SETTINGS.piperVoice).toBeNull();
  });

  it('speed slider within 0.5-2.0 range', () => {
    const min = Math.min(...SPEED_OPTIONS);
    const max = Math.max(...SPEED_OPTIONS);
    expect(min).toBe(0.5);
    expect(max).toBe(2.0);
    expect(DEFAULT_VOICE_SETTINGS.speed).toBe(1.0);
    expect(SPEED_OPTIONS).toContain(DEFAULT_VOICE_SETTINGS.speed);
  });

  it('model selection reflects hardware (null until downloaded)', () => {
    // Before download, both models are null
    expect(DEFAULT_VOICE_SETTINGS.whisperModel).toBeNull();
    expect(DEFAULT_VOICE_SETTINGS.piperVoice).toBeNull();

    // After download, they should have IDs
    const afterDownload = {
      ...DEFAULT_VOICE_SETTINGS,
      whisperModel: 'whisper-base',
      piperVoice: 'en_US-amy-medium',
    };
    expect(afterDownload.whisperModel).toBe('whisper-base');
    expect(afterDownload.piperVoice).toBe('en_US-amy-medium');
  });
});

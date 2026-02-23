// SilenceDetector Tests — Pure computation for silence detection.

import { describe, it, expect } from 'vitest';
import { SilenceDetector } from '../../../packages/core/voice/silence-detector';

describe('SilenceDetector', () => {
  it('loud audio → processChunk returns false', () => {
    const detector = new SilenceDetector({
      silenceThreshold: 0.01,
      silenceDurationMs: 1500,
      minRecordingMs: 500,
      chunkDurationMs: 100,
    });

    // Simulate 2 seconds of loud audio
    const loudChunk = new Float32Array(1600).fill(0.5); // High amplitude
    for (let i = 0; i < 20; i++) {
      expect(detector.processChunk(loudChunk)).toBe(false);
    }
  });

  it('silence for 1.5s → processChunk returns true', () => {
    const detector = new SilenceDetector({
      silenceThreshold: 0.01,
      silenceDurationMs: 1500,
      minRecordingMs: 500,
      chunkDurationMs: 100,
    });

    const silentChunk = new Float32Array(1600).fill(0.001); // Below threshold
    const loudChunk = new Float32Array(1600).fill(0.5);

    // First, simulate some speech (meets minRecordingMs)
    for (let i = 0; i < 6; i++) {
      detector.processChunk(loudChunk); // 600ms of speech
    }

    // Then silence: 15 chunks × 100ms = 1500ms
    let triggered = false;
    for (let i = 0; i < 15; i++) {
      if (detector.processChunk(silentChunk)) {
        triggered = true;
        break;
      }
    }

    expect(triggered).toBe(true);
  });

  it('silence before minRecordingMs does not trigger', () => {
    const detector = new SilenceDetector({
      silenceThreshold: 0.01,
      silenceDurationMs: 1500,
      minRecordingMs: 500,
      chunkDurationMs: 100,
    });

    const silentChunk = new Float32Array(1600).fill(0.001);

    // Only 400ms of recording (< 500ms minRecordingMs)
    let triggered = false;
    for (let i = 0; i < 4; i++) {
      if (detector.processChunk(silentChunk)) {
        triggered = true;
      }
    }

    expect(triggered).toBe(false);
  });
});

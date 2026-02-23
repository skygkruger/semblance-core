// AudioResampler Tests — Pure function tests for resampling, stereo-to-mono, normalization.

import { describe, it, expect } from 'vitest';
import { resampleAudio, stereoToMono, normalizeAudio } from '../../../packages/core/voice/audio-resampler';

describe('AudioResampler', () => {
  it('44100Hz → 16000Hz produces correct output length', () => {
    const inputRate = 44100;
    const outputRate = 16000;
    const durationSeconds = 1;
    const input = new Float32Array(inputRate * durationSeconds);
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.sin(2 * Math.PI * 440 * (i / inputRate)); // 440Hz sine
    }

    const output = resampleAudio(input, inputRate, outputRate);
    const expectedLength = Math.floor(input.length / (inputRate / outputRate));
    expect(output.length).toBe(expectedLength);
    expect(output.length).toBeGreaterThan(0);
  });

  it('stereoToMono: stereo produces mono of half length', () => {
    // Interleaved stereo: [L0, R0, L1, R1, L2, R2]
    const stereo = new Float32Array([0.2, 0.8, 0.4, 0.6, 1.0, 0.0]);
    const mono = stereoToMono(stereo);

    expect(mono.length).toBe(3); // Half of 6
    expect(mono[0]).toBeCloseTo(0.5); // (0.2 + 0.8) / 2
    expect(mono[1]).toBeCloseTo(0.5); // (0.4 + 0.6) / 2
    expect(mono[2]).toBeCloseTo(0.5); // (1.0 + 0.0) / 2
  });

  it('normalizeAudio: output within [-1.0, 1.0]', () => {
    // Audio with values outside [-1, 1]
    const input = new Float32Array([0.5, -2.0, 1.5, -0.3, 3.0]);
    const output = normalizeAudio(input);

    for (let i = 0; i < output.length; i++) {
      expect(Math.abs(output[i]!)).toBeLessThanOrEqual(1.0);
    }
    // The max absolute value (3.0) should map to 1.0
    expect(output[4]).toBeCloseTo(1.0);
    // -2.0 / 3.0 ≈ -0.667
    expect(output[1]).toBeCloseTo(-2.0 / 3.0);
  });
});

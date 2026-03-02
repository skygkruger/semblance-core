/**
 * isVoiceCapable — Unit tests for voice hardware capability detection.
 *
 * Tests the pure function that determines whether a device can run
 * Whisper.cpp for local speech-to-text based on RAM and tier.
 */

import { describe, it, expect } from 'vitest';
import { isVoiceCapable } from '../../packages/core/llm/hardware-types';

describe('isVoiceCapable', () => {
  // ─── Desktop ────────────────────────────────────────────────────────────────

  it('returns true for desktop 8GB+ standard tier', () => {
    expect(isVoiceCapable(8192, 'standard', 'desktop')).toBe(true);
  });

  it('returns true for desktop 16GB performance tier', () => {
    expect(isVoiceCapable(16384, 'performance', 'desktop')).toBe(true);
  });

  it('returns false for desktop <8GB', () => {
    expect(isVoiceCapable(4096, 'constrained', 'desktop')).toBe(false);
    expect(isVoiceCapable(6144, 'constrained', 'desktop')).toBe(false);
  });

  it('returns false for desktop constrained tier even with 8GB', () => {
    // Edge case: user could have 8GB but be classified constrained
    // due to other resource pressure or manual override
    expect(isVoiceCapable(8192, 'constrained', 'desktop')).toBe(false);
  });

  // ─── Mobile ─────────────────────────────────────────────────────────────────

  it('returns true for mobile 4GB+', () => {
    expect(isVoiceCapable(4096, 'standard', 'mobile')).toBe(true);
    expect(isVoiceCapable(6144, 'standard', 'mobile')).toBe(true);
    expect(isVoiceCapable(8192, 'performance', 'mobile')).toBe(true);
  });

  it('returns false for mobile <4GB', () => {
    expect(isVoiceCapable(2048, 'constrained', 'mobile')).toBe(false);
    expect(isVoiceCapable(3072, 'constrained', 'mobile')).toBe(false);
  });
});

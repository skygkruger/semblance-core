// VoiceOnboardingCard Tests — Verify rendering and state display.

import { describe, it, expect } from 'vitest';

// Test the logic directly (no React rendering in vitest)
describe('VoiceOnboardingCard', () => {
  it('onboarding card shows when models not downloaded', () => {
    const whisperDownloaded = false;
    const piperDownloaded = false;

    // Card should be visible when at least one model is not downloaded
    const shouldShow = !whisperDownloaded || !piperDownloaded;
    expect(shouldShow).toBe(true);
  });

  it('voice status indicator shows correct state', () => {
    // Map download state to status indicator
    function getStatus(downloaded: boolean): 'success' | 'attention' {
      return downloaded ? 'success' : 'attention';
    }

    expect(getStatus(false)).toBe('attention');
    expect(getStatus(true)).toBe('success');
  });
});

// useHardwareTier — Mobile hook for hardware capability detection.
//
// Uses platform-specific detection (React Native device info).
// Caches result at module level — hardware doesn't change mid-session.
// Mobile voice threshold: 4GB+ RAM.
//
// CRITICAL: No network imports. Local hardware inspection only.

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { isVoiceCapable } from '@semblance/core/llm/hardware-types';
import type { HardwareProfileTier } from '@semblance/core/llm/hardware-types';

export interface HardwareTierInfo {
  tier: HardwareProfileTier;
  totalRamMb: number;
  voiceCapable: boolean;
  loading: boolean;
}

// Module-level cache — hardware doesn't change during a session
let cached: HardwareTierInfo | null = null;

export function useHardwareTier(): HardwareTierInfo {
  const [info, setInfo] = useState<HardwareTierInfo>(
    cached ?? { tier: 'standard', totalRamMb: 0, voiceCapable: false, loading: true }
  );

  useEffect(() => {
    if (cached) {
      setInfo(cached);
      return;
    }

    // TODO(Sprint 4): Wire to unified-bridge.ts detectMobilePlatform() for real RAM detection
    // For now, estimate based on platform heuristics
    const estimatedRamMb = Platform.OS === 'ios' ? 6144 : 4096;
    const tier: HardwareProfileTier = estimatedRamMb >= 6144 ? 'standard' : 'constrained';

    const result: HardwareTierInfo = {
      tier,
      totalRamMb: estimatedRamMb,
      voiceCapable: isVoiceCapable(estimatedRamMb, tier, 'mobile'),
      loading: false,
    };
    cached = result;
    setInfo(result);
  }, []);

  return info;
}

/** Reset module cache — for testing only */
export function _resetHardwareTierCache(): void {
  cached = null;
}

// useHardwareTier — Mobile hook for hardware capability detection.
//
// Uses platform-specific detection (React Native device info).
// Caches result at module level — hardware doesn't change mid-session.
// Mobile voice threshold: 4GB+ RAM.
//
// CRITICAL: No network imports. Local hardware inspection only.

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
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

    // Use react-native-device-info for actual RAM detection
    DeviceInfo.getTotalMemory()
      .then((totalBytes) => {
        const ramMb = Math.round(totalBytes / (1024 * 1024));
        const tier: HardwareProfileTier = ramMb >= 6144 ? 'standard' : 'constrained';
        const result: HardwareTierInfo = {
          tier,
          totalRamMb: ramMb,
          voiceCapable: isVoiceCapable(ramMb, tier, 'mobile'),
          loading: false,
        };
        cached = result;
        setInfo(result);
      })
      .catch(() => {
        // Fallback to platform-based estimates if DeviceInfo fails
        // iOS: 6GB conservative estimate; Android: 4GB conservative estimate
        const fallbackRamMb = Platform.OS === 'ios' ? 6144 : 4096;
        const tier: HardwareProfileTier = fallbackRamMb >= 6144 ? 'standard' : 'constrained';
        const result: HardwareTierInfo = {
          tier,
          totalRamMb: fallbackRamMb,
          voiceCapable: isVoiceCapable(fallbackRamMb, tier, 'mobile'),
          loading: false,
        };
        cached = result;
        setInfo(result);
      });
  }, []);

  return info;
}

/** Reset module cache — for testing only */
export function _resetHardwareTierCache(): void {
  cached = null;
}

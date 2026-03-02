// useHardwareTier — Desktop hook for hardware capability detection.
//
// Calls detectHardware() IPC once, caches result at module level.
// Subsequent renders get cached value instantly (hardware doesn't change mid-session).
// Falls back to isVoiceCapable() if Rust side doesn't send voiceCapable (backward compat).
//
// CRITICAL: No network imports. Local hardware inspection only.

import { useState, useEffect } from 'react';
import { detectHardware } from '../ipc/commands';
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

    let cancelled = false;

    detectHardware().then((hw) => {
      if (cancelled) return;
      const tier = hw.tier as HardwareProfileTier;
      const result: HardwareTierInfo = {
        tier,
        totalRamMb: hw.totalRamMb,
        voiceCapable: hw.voiceCapable ?? isVoiceCapable(hw.totalRamMb, tier, 'desktop'),
        loading: false,
      };
      cached = result;
      setInfo(result);
    });

    return () => { cancelled = true; };
  }, []);

  return info;
}

/** Reset module cache — for testing only */
export function _resetHardwareTierCache(): void {
  cached = null;
}

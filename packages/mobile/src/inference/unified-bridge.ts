// Unified Bridge Factory — Selects the correct MobileInferenceBridge
// based on the runtime platform and available native modules.
//
// Priority: BitNet (optimized 1-bit CPU) > MLX (iOS) / llama.cpp (Android)
//
// BitNet.cpp is tried first because it provides optimized TL1 kernels for ARM
// that are 2-5x faster than standard llama.cpp for i2_s quantized models.
// Falls back to platform-specific bridges if BitNet native module is not available.
//
// On non-RN environments (testing), import test bridges directly.

import type { MobileInferenceBridge, MobilePlatform } from '@semblance/core/llm/mobile-bridge-types.js';

export interface UnifiedBridgeConfig {
  platform: MobilePlatform;
  /** If true, skip BitNet and use platform-specific bridge directly. */
  skipBitNet?: boolean;
}

/**
 * Create the correct MobileInferenceBridge for the current platform.
 *
 * Priority:
 *   1. BitNet (both platforms) — SemblanceBitNet native module (optimized 1-bit CPU)
 *   2. iOS fallback → MLXBridgeAdapter wrapping the SemblanceMLX native module
 *   3. Android fallback → LlamaCppBridgeAdapter wrapping the SemblanceLlama native module
 *
 * Throws if no native module is available.
 */
export async function createMobileInferenceBridge(
  config: UnifiedBridgeConfig,
): Promise<MobileInferenceBridge> {
  // Try BitNet first (available on both platforms via cross-compiled static lib)
  if (!config.skipBitNet) {
    try {
      const { BitNetMobileBridgeAdapter } = await import('./bitnet-mobile-bridge.js');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NativeModules } = require('react-native');
      const bitnetModule = NativeModules.SemblanceBitNet;
      if (bitnetModule) {
        return new BitNetMobileBridgeAdapter(bitnetModule, config.platform);
      }
    } catch {
      // BitNet native module not available — fall through to platform-specific
    }
  }

  if (config.platform === 'ios') {
    // Dynamic import so Android bundle doesn't include iOS code
    const { MLXBridgeAdapter } = await import('./mlx-bridge.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require('react-native');
    const nativeModule = NativeModules.SemblanceMLX;
    if (!nativeModule) {
      throw new Error(
        'SemblanceMLX native module not found. Ensure the iOS native module is linked.',
      );
    }
    return new MLXBridgeAdapter(nativeModule);
  }

  if (config.platform === 'android') {
    // Dynamic import so iOS bundle doesn't include Android code
    const { LlamaCppBridgeAdapter } = await import('./llamacpp-bridge.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require('react-native');
    const nativeModule = NativeModules.SemblanceLlama;
    if (!nativeModule) {
      throw new Error(
        'SemblanceLlama native module not found. Ensure the Android native module is linked.',
      );
    }
    return new LlamaCppBridgeAdapter(nativeModule);
  }

  throw new Error(`Unsupported mobile platform: ${config.platform}`);
}

/**
 * Detect the mobile platform from React Native's Platform module.
 * Returns null if not running in React Native.
 */
export function detectMobilePlatform(): MobilePlatform | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native');
    if (Platform.OS === 'ios') return 'ios';
    if (Platform.OS === 'android') return 'android';
    return null;
  } catch {
    // Not in React Native environment
    return null;
  }
}

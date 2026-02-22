// Unified Bridge Factory — Selects the correct MobileInferenceBridge
// based on the runtime platform (iOS → MLX, Android → llama.cpp).
//
// This is the entry point for mobile inference. Call createMobileInferenceBridge()
// with the platform string, and it returns the appropriate native bridge adapter.
//
// On non-RN environments (testing), import MockMLXBridge / MockLlamaCppBridge directly.

import type { MobileInferenceBridge, MobilePlatform } from '@semblance/core/llm/mobile-bridge-types.js';

export interface UnifiedBridgeConfig {
  platform: MobilePlatform;
}

/**
 * Create the correct MobileInferenceBridge for the current platform.
 *
 * - iOS → MLXBridgeAdapter wrapping the SemblanceMLX native module
 * - Android → LlamaCppBridgeAdapter wrapping the SemblanceLlama native module
 *
 * Throws if the native module is not available (e.g., running on wrong platform).
 */
export async function createMobileInferenceBridge(
  config: UnifiedBridgeConfig,
): Promise<MobileInferenceBridge> {
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

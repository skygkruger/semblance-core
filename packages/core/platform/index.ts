// Platform — Global singleton for platform-specific API access.
//
// Desktop: auto-detected at import time (Node.js environment).
// Mobile: must call setPlatform() at app startup before any Core module runs.
//
// Core modules use getPlatform() to access file system, paths, crypto, SQLite, etc.
// This eliminates scattered Node.js imports throughout packages/core/.

import type { PlatformAdapter } from './types.js';
import { createDesktopAdapter as _createDesktopAdapter } from './desktop-adapter.js';

// Re-export all types
export type {
  PlatformAdapter,
  FileSystemAdapter,
  PathAdapter,
  CryptoAdapter,
  SQLiteAdapter,
  DatabaseHandle,
  PreparedStatement,
  HardwareAdapter,
  NotificationAdapter,
} from './types.js';

// Re-export adapter factories
export { createDesktopAdapter } from './desktop-adapter.js';
export { createMobileAdapter, mobilePath } from './mobile-adapter.js';
export type { MobileAdapterConfig } from './mobile-adapter.js';

// ─── Global Platform Singleton ──────────────────────────────────────────────

let _platform: PlatformAdapter | null = null;

/**
 * Set the active platform adapter.
 * Must be called before any Core module uses getPlatform().
 *
 * Desktop: called automatically by initDesktopPlatform().
 * Mobile: called manually at React Native app startup with createMobileAdapter().
 */
export function setPlatform(adapter: PlatformAdapter): void {
  _platform = adapter;
}

/**
 * Get the active platform adapter.
 * Throws if setPlatform() has not been called yet.
 */
export function getPlatform(): PlatformAdapter {
  if (!_platform) {
    // Auto-detect desktop environment
    if (typeof process !== 'undefined' && process.versions?.node) {
      // We're in Node.js — lazy-initialize desktop adapter
      _platform = _createDesktopAdapter();
    } else {
      throw new Error(
        '[Platform] No platform configured. ' +
        'Call setPlatform(createMobileAdapter({...})) at React Native app startup.'
      );
    }
  }
  return _platform;
}

/**
 * Check if a platform adapter has been configured.
 */
export function hasPlatform(): boolean {
  return _platform !== null;
}

/**
 * Reset the platform adapter (for testing).
 */
export function resetPlatform(): void {
  _platform = null;
}

/**
 * Initialize the desktop platform adapter.
 * Convenience function — equivalent to setPlatform(createDesktopAdapter()).
 */
export function initDesktopPlatform(): PlatformAdapter {
  const adapter = _createDesktopAdapter();
  setPlatform(adapter);
  return adapter;
}

/**
 * Check if we're running on a mobile platform.
 */
export function isMobilePlatform(): boolean {
  if (!_platform) return false;
  return _platform.name === 'mobile-ios' || _platform.name === 'mobile-android';
}

/**
 * Check if we're running on desktop.
 */
export function isDesktopPlatform(): boolean {
  if (!_platform) return false;
  return _platform.name === 'desktop';
}

// Location Permission Manager — Manages location permission state.
//
// Key behavior: NEVER re-requests permission after a denial.
// Tracks permission state and provides a clean interface for the UI.
//
// CRITICAL: This file is in packages/core/. No network imports.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { PlatformAdapter } from '../platform/types.js';

export type LocationPermissionState = 'authorized' | 'denied' | 'unavailable' | 'not_requested';

export class LocationPermissionManager {
  private platform: PlatformAdapter;
  private wasDenied: boolean = false;

  constructor(platform: PlatformAdapter) {
    this.platform = platform;
  }

  /**
   * Get the current permission state.
   */
  async getPermissionState(): Promise<LocationPermissionState> {
    if (!this.platform.location) return 'unavailable';
    const hasIt = await this.platform.location.hasPermission();
    if (hasIt) return 'authorized';
    if (this.wasDenied) return 'denied';
    return 'not_requested';
  }

  /**
   * Request permission if not yet denied.
   * NEVER re-requests after denial — that's a dark pattern.
   */
  async requestIfNeeded(): Promise<LocationPermissionState> {
    if (!this.platform.location) return 'unavailable';

    // Already denied? Don't pester the user.
    if (this.wasDenied) return 'denied';

    const hasIt = await this.platform.location.hasPermission();
    if (hasIt) return 'authorized';

    const result = await this.platform.location.requestPermission();
    if (result === 'denied') {
      this.wasDenied = true;
      return 'denied';
    }

    return 'authorized';
  }

  /**
   * Check if location is available on this platform.
   */
  isLocationAvailable(): boolean {
    return this.platform.location !== undefined;
  }
}

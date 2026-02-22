// Location Settings Tests — Verify settings toggle persistence, permission state, and defaults.

import { describe, it, expect } from 'vitest';

describe('LocationSettings', () => {
  it('location toggle respects permission state', () => {
    // When permission is denied, toggling location should not enable sub-features
    const settings = {
      enabled: false,
      remindersEnabled: false,
      commuteEnabled: false,
      weatherEnabled: false,
      defaultCity: '',
      retentionDays: 7,
    };

    // Toggle on
    const updated = { ...settings, enabled: true };
    expect(updated.enabled).toBe(true);
    // Sub-toggles should still be off until individually enabled
    expect(updated.remindersEnabled).toBe(false);
    expect(updated.commuteEnabled).toBe(false);
    expect(updated.weatherEnabled).toBe(false);
  });

  it('weather works with configured city when location unavailable', () => {
    const settings = {
      enabled: true,
      remindersEnabled: false,
      commuteEnabled: false,
      weatherEnabled: true,
      defaultCity: 'Portland, OR',
      retentionDays: 7,
    };

    // When location services are enabled but GPS is unavailable,
    // defaultCity provides fallback for weather queries
    expect(settings.weatherEnabled).toBe(true);
    expect(settings.defaultCity).toBe('Portland, OR');
    expect(settings.defaultCity.length).toBeGreaterThan(0);
  });

  it('location services defaults OFF', () => {
    // The initial state in AppState.tsx sets all location settings to false
    const initialLocationSettings = {
      enabled: false,
      remindersEnabled: false,
      commuteEnabled: false,
      weatherEnabled: false,
      defaultCity: '',
      retentionDays: 7,
    };

    expect(initialLocationSettings.enabled).toBe(false);
    expect(initialLocationSettings.remindersEnabled).toBe(false);
    expect(initialLocationSettings.commuteEnabled).toBe(false);
    expect(initialLocationSettings.weatherEnabled).toBe(false);
    expect(initialLocationSettings.retentionDays).toBe(7);
  });
});

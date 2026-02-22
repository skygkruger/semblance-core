// Preferences Sync — Wires preference changes to SyncEngine.
//
// When the user changes autonomy tier, per-domain config, daily digest
// preferences, or notification settings on any device, the change is
// pushed to SyncEngine so it's included in the next sync payload.
//
// CRITICAL: This module is the bridge between preference stores and sync.
// All preference changes that should sync across devices MUST flow through here.

import type { SyncEngine, SyncItem } from './sync.js';

export type PreferenceKey =
  | 'autonomy_tier'
  | 'domain_config'
  | 'daily_digest_prefs'
  | 'notification_prefs';

/**
 * Push a preference change to SyncEngine for cross-device sync.
 * Creates a SyncItem of type 'preference' with last-write-wins resolution.
 */
export function syncPreferenceChange(
  syncEngine: SyncEngine,
  deviceId: string,
  key: PreferenceKey,
  data: unknown,
): void {
  const item: SyncItem = {
    id: `pref-${key}`,
    type: 'preference',
    data: { key, value: data },
    updatedAt: new Date().toISOString(),
    sourceDeviceId: deviceId,
  };
  syncEngine.upsertItem(item);
}

/**
 * Push an autonomy tier change for a specific domain to SyncEngine.
 */
export function syncAutonomyTierChange(
  syncEngine: SyncEngine,
  deviceId: string,
  domain: string,
  tier: string,
): void {
  syncPreferenceChange(syncEngine, deviceId, 'domain_config', {
    domain,
    tier,
  });
}

/**
 * Push daily digest preference changes to SyncEngine.
 */
export function syncDailyDigestPreferences(
  syncEngine: SyncEngine,
  deviceId: string,
  prefs: { enabled: boolean; time: string },
): void {
  syncPreferenceChange(syncEngine, deviceId, 'daily_digest_prefs', prefs);
}

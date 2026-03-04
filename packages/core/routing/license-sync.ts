// License Key Sync — Cross-device license key synchronization.
//
// When a user activates their license on one device (desktop or mobile),
// this module builds a SyncItem containing the license key so it can be
// synced to paired devices over encrypted local-network sync.
//
// The receiving device validates the Ed25519 signature before activation
// to prevent injection of invalid or tampered keys.
//
// License sync uses a singleton SyncItem (id: 'license-active') so only
// one license key is tracked at a time.

import type { SyncItem } from './sync.js';
import { verifyLicenseKeySignature } from '../premium/license-keys.js';
import type { LicenseTier } from '../premium/premium-gate.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LicenseSyncData {
  licenseKey: string;
  tier: LicenseTier;
  activatedAt: string;
  expiresAt: string | null;
  foundingSeat: number | null;
}

/** Minimal interface for reading PremiumGate state without importing the full class */
export interface LicenseStateReader {
  isPremium(): boolean;
  getTier(): LicenseTier;
  getLicenseKey(): string | null;
  getActivatedAt(): string | null;
  getExpiresAt(): string | null;
  getFoundingSeat(): number | null;
}

/** Minimal interface for activating a license on the receiving device */
export interface LicenseActivator {
  activateLicense(key: string): Promise<{ success: boolean; error?: string }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LICENSE_SYNC_ID = 'license-active';

// ─── Build ──────────────────────────────────────────────────────────────────

/**
 * Build a SyncItem for the current license key.
 * Returns null if the user is on the free tier (no key to sync).
 */
export function buildLicenseSyncItem(
  gate: LicenseStateReader,
  deviceId: string,
): SyncItem | null {
  if (!gate.isPremium()) return null;

  const licenseKey = gate.getLicenseKey();
  if (!licenseKey) return null;

  const data: LicenseSyncData = {
    licenseKey,
    tier: gate.getTier(),
    activatedAt: gate.getActivatedAt() ?? new Date().toISOString(),
    expiresAt: gate.getExpiresAt(),
    foundingSeat: gate.getFoundingSeat(),
  };

  return {
    id: LICENSE_SYNC_ID,
    type: 'license',
    data,
    updatedAt: data.activatedAt,
    sourceDeviceId: deviceId,
  };
}

// ─── Apply ──────────────────────────────────────────────────────────────────

/**
 * Apply a received license SyncItem to the local device.
 *
 * 1. Extracts the license key from sync data
 * 2. Validates Ed25519 signature (rejects invalid/tampered keys)
 * 3. Checks expiry
 * 4. Activates via the gate if valid and newer than local
 *
 * Returns true if the license was activated, false otherwise.
 */
export async function applyLicenseSyncItem(
  item: SyncItem,
  gate: LicenseActivator,
): Promise<boolean> {
  if (item.type !== 'license') return false;
  if (item.id !== LICENSE_SYNC_ID) return false;

  const data = item.data as LicenseSyncData;
  if (!data.licenseKey) return false;

  // Validate Ed25519 signature before trusting the key
  const verification = verifyLicenseKeySignature(data.licenseKey);
  if (!verification.valid) return false;

  // Check if the key has expired
  if (data.expiresAt) {
    const expiryTime = new Date(data.expiresAt).getTime();
    if (expiryTime < Date.now()) return false;
  }

  // Activate on this device
  const result = await gate.activateLicense(data.licenseKey);
  return result.success;
}

/**
 * Premium Gate -- Feature gating for Digital Representative tier.
 *
 * License key format: sem_<base64(JSON{tier,exp})>.<signature>
 * Tiers: 'free', 'founding', 'digital-representative', 'lifetime'
 *
 * Gate checks happen at orchestrator/UI level, NOT inside analysis classes.
 * This keeps SpendingAnalyzer, AnomalyDetector, LLMCategorizer pure and testable.
 *
 * SECURITY: License keys are stored in the OS keychain (via KeyStorage), NOT in SQLite.
 * SQLite stores only metadata: tier, activated_at, expires_at, founding_seat.
 * The actual key material never touches the database.
 */

import type { DatabaseHandle } from '../platform/types.js';
import { verifyFoundingToken } from './founding-token.js';
import { verifyLicenseKeySignature } from './license-keys.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LicenseTier = 'free' | 'founding' | 'digital-representative' | 'lifetime';

export type PremiumFeature =
  | 'transaction-categorization'
  | 'spending-insights'
  | 'anomaly-detection'
  | 'plaid-integration'
  | 'financial-dashboard'
  | 'representative-drafting'
  | 'subscription-cancellation'
  | 'representative-dashboard'
  | 'form-automation'
  | 'bureaucracy-tracking'
  | 'health-tracking'
  | 'health-insights'
  | 'import-digital-life'
  | 'dark-pattern-detection'
  | 'financial-advocacy'
  | 'living-will'
  | 'witness-attestation'
  | 'inheritance-protocol'
  | 'semblance-network'
  | 'proof-of-privacy';

export interface ActivationResult {
  success: boolean;
  tier?: LicenseTier;
  expiresAt?: string;
  error?: string;
}

interface LicenseRow {
  tier: string;
  activated_at: string;
  expires_at: string | null;
  founding_seat: number | null;
}

/**
 * KeyStorage interface for license key persistence in OS keychain.
 * Matches the KeyStorage interface from gateway/credentials/key-storage.ts.
 * Defined here to avoid importing gateway code into core.
 */
export interface LicenseKeyStorage {
  /** Store a license key in the OS keychain. */
  setLicenseKey(key: string): Promise<void>;
  /** Retrieve the license key from the OS keychain. Returns null if not set. */
  getLicenseKey(): Promise<string | null>;
  /** Delete the license key from the OS keychain. */
  deleteLicenseKey(): Promise<void>;
}

// ─── Feature → Tier Mapping ─────────────────────────────────────────────────

const FEATURE_TIER_MAP: Record<PremiumFeature, LicenseTier> = {
  'transaction-categorization': 'digital-representative',
  'spending-insights': 'digital-representative',
  'anomaly-detection': 'digital-representative',
  'plaid-integration': 'digital-representative',
  'financial-dashboard': 'digital-representative',
  'representative-drafting': 'digital-representative',
  'subscription-cancellation': 'digital-representative',
  'representative-dashboard': 'digital-representative',
  'form-automation': 'digital-representative',
  'bureaucracy-tracking': 'digital-representative',
  'health-tracking': 'digital-representative',
  'health-insights': 'digital-representative',
  'import-digital-life': 'digital-representative',
  'dark-pattern-detection': 'digital-representative',
  'financial-advocacy': 'digital-representative',
  'living-will': 'digital-representative',
  'witness-attestation': 'digital-representative',
  'inheritance-protocol': 'digital-representative',
  'semblance-network': 'digital-representative',
  'proof-of-privacy': 'digital-representative',
};

const TIER_RANK: Record<LicenseTier, number> = {
  'free': 0,
  'founding': 1,
  'digital-representative': 1,
  'lifetime': 2,
};

// ─── Premium Gate ───────────────────────────────────────────────────────────

export class PremiumGate {
  private db: DatabaseHandle;
  private keyStorage: LicenseKeyStorage | null;

  constructor(db: DatabaseHandle, keyStorage?: LicenseKeyStorage) {
    this.db = db;
    this.keyStorage = keyStorage ?? null;
    this.ensureTable();
  }

  private ensureTable(): void {
    // SECURITY: license_key column removed — keys stored in OS keychain only.
    // Metadata-only schema: tier, activated_at, expires_at, founding_seat.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS license (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tier TEXT NOT NULL DEFAULT 'free',
        activated_at TEXT NOT NULL,
        expires_at TEXT,
        founding_seat INTEGER
      )
    `);

    // Migration: add founding_seat column to existing tables that lack it.
    try {
      this.db.exec('ALTER TABLE license ADD COLUMN founding_seat INTEGER');
    } catch {
      // Column already exists — expected on subsequent runs
    }

    // Migration: drop license_key column from legacy databases.
    // SQLite doesn't support DROP COLUMN before 3.35.0, so we
    // recreate the table without it. Wrapped in try-catch because
    // the column may already be absent on fresh installs.
    this.migrateLegacyKeyColumn();
  }

  /**
   * Remove the license_key column from legacy databases.
   * The key is now stored in the OS keychain, never in SQLite.
   */
  private migrateLegacyKeyColumn(): void {
    try {
      // Check if license_key column exists by querying table_info
      const columns = this.db.prepare("PRAGMA table_info('license')").all() as Array<{ name: string }>;
      const hasKeyColumn = columns.some(c => c.name === 'license_key');

      if (!hasKeyColumn) return; // Already migrated or fresh install

      // Recreate table without license_key column
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS license_new (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          tier TEXT NOT NULL DEFAULT 'free',
          activated_at TEXT NOT NULL,
          expires_at TEXT,
          founding_seat INTEGER
        );
        INSERT OR REPLACE INTO license_new (id, tier, activated_at, expires_at, founding_seat)
          SELECT id, tier, activated_at, expires_at, founding_seat FROM license;
        DROP TABLE license;
        ALTER TABLE license_new RENAME TO license;
      `);
    } catch {
      // Migration failed — table may be in unexpected state.
      // On next launch the ensureTable() CREATE IF NOT EXISTS handles fresh state.
    }
  }

  /**
   * Returns true if current license is founding, digital-representative, or lifetime AND not expired.
   */
  isPremium(): boolean {
    const tier = this.getLicenseTier();
    if (tier === 'free') return false;

    const row = this.db.prepare('SELECT expires_at FROM license WHERE id = 1').get() as LicenseRow | undefined;
    if (!row) return false;

    // Founding and lifetime never expire
    if (tier === 'lifetime' || tier === 'founding') return true;

    // Check expiration
    if (row.expires_at) {
      return new Date(row.expires_at).getTime() > Date.now();
    }

    return true;
  }

  /**
   * Returns the current license tier, or 'free' if no license.
   */
  getLicenseTier(): LicenseTier {
    const row = this.db.prepare('SELECT tier FROM license WHERE id = 1').get() as LicenseRow | undefined;
    if (!row) return 'free';
    return row.tier as LicenseTier;
  }

  /**
   * Activate a license key.
   * Key format: sem_<base64(JSON{tier,exp})>.<signature>
   * Three dot-separated segments where middle decodes to JSON with tier+exp.
   */
  activateLicense(key: string): ActivationResult {
    // Validate prefix
    if (!key.startsWith('sem_')) {
      return { success: false, error: 'Invalid license key format: must start with sem_' };
    }

    const withoutPrefix = key.slice(4); // Remove 'sem_'
    const segments = withoutPrefix.split('.');

    if (segments.length !== 3) {
      return { success: false, error: 'Invalid license key format: expected 3 dot-separated segments' };
    }

    // Verify Ed25519 signature before trusting payload contents
    const sigResult = verifyLicenseKeySignature(key);
    if (!sigResult.valid) {
      return { success: false, error: sigResult.error ?? 'Invalid license key signature' };
    }

    // Decode middle segment (base64url JSON)
    let payload: { tier?: string; exp?: string; seat?: number };
    try {
      // Handle both standard base64 and base64url encoding
      let b64 = segments[1]!.replace(/-/g, '+').replace(/_/g, '/');
      const padding = b64.length % 4;
      if (padding === 2) b64 += '==';
      else if (padding === 3) b64 += '=';
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      payload = JSON.parse(decoded);
    } catch {
      return { success: false, error: 'Invalid license key: could not decode payload' };
    }

    // Validate tier
    const tier = payload.tier;
    if (tier !== 'digital-representative' && tier !== 'lifetime' && tier !== 'founding') {
      return { success: false, error: `Invalid license tier: ${tier}` };
    }

    // Parse expiration — founding and lifetime keys have no expiry
    const expiresAt = payload.exp ?? null;
    if (expiresAt && isNaN(new Date(expiresAt).getTime())) {
      return { success: false, error: 'Invalid expiration date in license key' };
    }

    // Check if already expired
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return { success: false, error: 'License key has expired' };
    }

    const now = new Date().toISOString();
    const seat = tier === 'founding' && payload.seat ? payload.seat : null;

    // Upsert license metadata in SQLite (NO license key stored here)
    this.db.prepare(`
      INSERT INTO license (id, tier, activated_at, expires_at, founding_seat)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tier = excluded.tier,
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at,
        founding_seat = excluded.founding_seat
    `).run(tier, now, expiresAt, seat);

    // Store the actual license key in OS keychain (async, fire-and-forget for sync compat)
    if (this.keyStorage) {
      this.keyStorage.setLicenseKey(key).catch(() => {
        // Best-effort keychain storage — metadata is already in SQLite
      });
    }

    return {
      success: true,
      tier: tier as LicenseTier,
      expiresAt: expiresAt ?? undefined,
    };
  }

  /**
   * Activate a founding member token (JWT signed with Ed25519).
   * Separate entry point from activateLicense() which handles sem_ format keys.
   */
  activateFoundingMember(token: string): ActivationResult {
    const result = verifyFoundingToken(token);

    if (!result.valid || !result.payload) {
      return { success: false, error: result.error ?? 'Invalid founding member token' };
    }

    const now = new Date().toISOString();

    // Upsert license metadata — founding membership never expires
    this.db.prepare(`
      INSERT INTO license (id, tier, activated_at, expires_at, founding_seat)
      VALUES (1, 'founding', ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        tier = 'founding',
        activated_at = excluded.activated_at,
        expires_at = NULL,
        founding_seat = excluded.founding_seat
    `).run(now, result.payload.seat);

    // Store founding token in OS keychain
    if (this.keyStorage) {
      this.keyStorage.setLicenseKey(token).catch(() => {
        // Best-effort keychain storage
      });
    }

    return {
      success: true,
      tier: 'founding',
    };
  }

  /**
   * Returns true if the current license is a founding member tier.
   */
  isFoundingMember(): boolean {
    return this.getLicenseTier() === 'founding';
  }

  /**
   * Returns the founding member seat number, or null if not a founding member.
   */
  getFoundingSeat(): number | null {
    const row = this.db.prepare('SELECT founding_seat FROM license WHERE id = 1').get() as
      | { founding_seat: number | null }
      | undefined;
    if (!row) return null;
    return row.founding_seat ?? null;
  }

  /**
   * Returns the stored license key from OS keychain, or null if no license.
   * Async because keychain access is async.
   */
  async getLicenseKey(): Promise<string | null> {
    if (!this.keyStorage) return null;
    try {
      return await this.keyStorage.getLicenseKey();
    } catch {
      return null;
    }
  }

  /**
   * Disconnect / deactivate the current license.
   * Clears both SQLite metadata and OS keychain key.
   */
  async disconnect(): Promise<void> {
    // Clear keychain first
    if (this.keyStorage) {
      await this.keyStorage.deleteLicenseKey().catch(() => {});
    }
    // Clear SQLite metadata
    this.db.prepare('DELETE FROM license WHERE id = 1').run();
  }

  /**
   * Check if a specific feature is available at the current tier.
   */
  isFeatureAvailable(feature: PremiumFeature): boolean {
    if (!this.isPremium()) {
      return false;
    }

    const currentTier = this.getLicenseTier();
    const requiredTier = FEATURE_TIER_MAP[feature];

    return TIER_RANK[currentTier] >= TIER_RANK[requiredTier];
  }

  /**
   * Returns all features available at the current tier.
   */
  getAvailableFeatures(): PremiumFeature[] {
    if (!this.isPremium()) return [];

    const currentTier = this.getLicenseTier();
    const currentRank = TIER_RANK[currentTier];

    return (Object.entries(FEATURE_TIER_MAP) as [PremiumFeature, LicenseTier][])
      .filter(([, requiredTier]) => currentRank >= TIER_RANK[requiredTier])
      .map(([feature]) => feature);
  }
}

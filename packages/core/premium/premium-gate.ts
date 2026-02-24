/**
 * Premium Gate -- Feature gating for Digital Representative tier.
 *
 * License key format: sem_<base64(JSON{tier,exp})>.<signature>
 * Tiers: 'free', 'digital-representative', 'lifetime'
 *
 * Gate checks happen at orchestrator/UI level, NOT inside analysis classes.
 * This keeps SpendingAnalyzer, AnomalyDetector, LLMCategorizer pure and testable.
 */

import type { DatabaseHandle } from '../platform/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LicenseTier = 'free' | 'digital-representative' | 'lifetime';

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
  | 'health-insights';

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
  license_key: string;
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
};

const TIER_RANK: Record<LicenseTier, number> = {
  'free': 0,
  'digital-representative': 1,
  'lifetime': 2,
};

// ─── Premium Gate ───────────────────────────────────────────────────────────

export class PremiumGate {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS license (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tier TEXT NOT NULL DEFAULT 'free',
        activated_at TEXT NOT NULL,
        expires_at TEXT,
        license_key TEXT NOT NULL
      )
    `);
  }

  /**
   * Returns true if current license is digital-representative or lifetime AND not expired.
   */
  isPremium(): boolean {
    const tier = this.getLicenseTier();
    if (tier === 'free') return false;

    const row = this.db.prepare('SELECT expires_at FROM license WHERE id = 1').get() as LicenseRow | undefined;
    if (!row) return false;

    // Lifetime never expires
    if (tier === 'lifetime') return true;

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

    // Decode middle segment (base64 JSON)
    let payload: { tier?: string; exp?: string };
    try {
      const decoded = Buffer.from(segments[1]!, 'base64').toString('utf-8');
      payload = JSON.parse(decoded);
    } catch {
      return { success: false, error: 'Invalid license key: could not decode payload' };
    }

    // Validate tier
    const tier = payload.tier;
    if (tier !== 'digital-representative' && tier !== 'lifetime') {
      return { success: false, error: `Invalid license tier: ${tier}` };
    }

    // Parse expiration
    const expiresAt = payload.exp ?? null;
    if (expiresAt && isNaN(new Date(expiresAt).getTime())) {
      return { success: false, error: 'Invalid expiration date in license key' };
    }

    // Check if already expired
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      return { success: false, error: 'License key has expired' };
    }

    const now = new Date().toISOString();

    // Upsert license
    this.db.prepare(`
      INSERT INTO license (id, tier, activated_at, expires_at, license_key)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tier = excluded.tier,
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at,
        license_key = excluded.license_key
    `).run(tier, now, expiresAt, key);

    return {
      success: true,
      tier: tier as LicenseTier,
      expiresAt: expiresAt ?? undefined,
    };
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

/**
 * Step 29 — Premium gate integration tests (Commit 8).
 * Tests that Proof of Privacy is premium-gated while Dashboard is free.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { DataInventoryCollector } from '@semblance/core/privacy/data-inventory-collector';
import { NetworkActivityAggregator } from '@semblance/core/privacy/network-activity-aggregator';
import { ActionHistoryAggregator } from '@semblance/core/privacy/action-history-aggregator';
import { PrivacyGuaranteeChecker } from '@semblance/core/privacy/privacy-guarantee-checker';
import { ComparisonStatementGenerator } from '@semblance/core/privacy/comparison-statement-generator';
import { PrivacyDashboardProvider } from '@semblance/core/privacy/privacy-dashboard-provider';
import { ProofOfPrivacyGenerator } from '@semblance/core/privacy/proof-of-privacy-generator';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const TEST_DEVICE: DeviceIdentity = { id: 'gate-test-01', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

function createSharedDeps() {
  const dbHandle = db as unknown as DatabaseHandle;
  const collector = new DataInventoryCollector({ db: dbHandle });
  const networkAgg = new NetworkActivityAggregator({ db: dbHandle });
  const actionAgg = new ActionHistoryAggregator({ db: dbHandle });
  const guaranteeChecker = new PrivacyGuaranteeChecker();
  const comparisonGen = new ComparisonStatementGenerator({ dataInventoryCollector: collector });
  return { collector, networkAgg, actionAgg, guaranteeChecker, comparisonGen };
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('Privacy Premium Gate Integration (Step 29)', () => {
  it('premium gate blocks proof-of-privacy for free tier', async () => {
    expect(gate.isFeatureAvailable('proof-of-privacy')).toBe(false);

    const deps = createSharedDeps();
    const gen = new ProofOfPrivacyGenerator({
      premiumGate: gate,
      ...deps,
      comparisonStatementGenerator: deps.comparisonGen,
      dataInventoryCollector: deps.collector,
      networkActivityAggregator: deps.networkAgg,
      privacyGuaranteeChecker: deps.guaranteeChecker,
      deviceIdentity: TEST_DEVICE,
    });

    const result = await gen.generate();
    expect(result.success).toBe(false);
  });

  it('premium gate allows proof-of-privacy for DR tier', async () => {
    activatePremium();
    expect(gate.isFeatureAvailable('proof-of-privacy')).toBe(true);

    const deps = createSharedDeps();
    const gen = new ProofOfPrivacyGenerator({
      premiumGate: gate,
      ...deps,
      comparisonStatementGenerator: deps.comparisonGen,
      dataInventoryCollector: deps.collector,
      networkActivityAggregator: deps.networkAgg,
      privacyGuaranteeChecker: deps.guaranteeChecker,
      deviceIdentity: TEST_DEVICE,
    });

    const result = await gen.generate();
    expect(result.success).toBe(true);
  });

  it('Privacy Dashboard accessible without premium', async () => {
    // Free tier — dashboard should work
    const deps = createSharedDeps();
    const provider = new PrivacyDashboardProvider({
      ...deps,
      comparisonStatementGenerator: deps.comparisonGen,
      dataInventoryCollector: deps.collector,
      networkActivityAggregator: deps.networkAgg,
      actionHistoryAggregator: deps.actionAgg,
      privacyGuaranteeChecker: deps.guaranteeChecker,
    });

    const data = await provider.getDashboardData();
    expect(data).toBeDefined();
    expect(data.guarantees).toHaveLength(7);
    expect(data.inventory).toBeDefined();
  });

  it('Comparison Statement accessible without premium', async () => {
    const deps = createSharedDeps();
    const comparison = await deps.comparisonGen.generate();
    expect(comparison).toBeDefined();
    expect(comparison.summaryText).toBeTruthy();
  });
});

/**
 * Step 29 — ProofOfPrivacyGenerator tests (Commit 5).
 * Tests premium gating, report generation with all sections.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { PremiumGate } from '@semblance/core/premium/premium-gate';
import { DataInventoryCollector } from '@semblance/core/privacy/data-inventory-collector';
import { NetworkActivityAggregator } from '@semblance/core/privacy/network-activity-aggregator';
import { PrivacyGuaranteeChecker } from '@semblance/core/privacy/privacy-guarantee-checker';
import { ComparisonStatementGenerator } from '@semblance/core/privacy/comparison-statement-generator';
import { ProofOfPrivacyGenerator } from '@semblance/core/privacy/proof-of-privacy-generator';
import type { DeviceIdentity } from '@semblance/core/attestation/types';

let db: InstanceType<typeof Database>;
let gate: PremiumGate;

const TEST_DEVICE: DeviceIdentity = { id: 'privacy-test-01', platform: 'desktop' };

function activatePremium(): void {
  db.prepare(`
    INSERT OR REPLACE INTO license (id, tier, activated_at, expires_at)
    VALUES (1, 'digital-representative', ?, NULL)
  `).run(new Date().toISOString());
}

function createGenerator(): ProofOfPrivacyGenerator {
  const collector = new DataInventoryCollector({ db: db as unknown as DatabaseHandle });
  const networkAgg = new NetworkActivityAggregator({ db: db as unknown as DatabaseHandle });
  const guaranteeChecker = new PrivacyGuaranteeChecker();
  const comparisonGen = new ComparisonStatementGenerator({ dataInventoryCollector: collector });

  return new ProofOfPrivacyGenerator({
    premiumGate: gate,
    dataInventoryCollector: collector,
    networkActivityAggregator: networkAgg,
    privacyGuaranteeChecker: guaranteeChecker,
    comparisonStatementGenerator: comparisonGen,
    deviceIdentity: TEST_DEVICE,
  });
}

beforeEach(() => {
  db = new Database(':memory:');
  gate = new PremiumGate(db as unknown as DatabaseHandle);
});

afterEach(() => {
  db.close();
});

describe('ProofOfPrivacyGenerator (Step 29)', () => {
  it('rejects when premium inactive', async () => {
    const gen = createGenerator();
    const result = await gen.generate();
    expect(result.success).toBe(false);
    expect(result.error).toContain('Digital Representative');
    expect(result.report).toBeUndefined();
  });

  it('returns report with correct @context and @type', async () => {
    activatePremium();
    const gen = createGenerator();
    const result = await gen.generate();
    expect(result.success).toBe(true);
    expect(result.report!['@context']).toBe('https://veridian.run/privacy/v1');
    expect(result.report!['@type']).toBe('ProofOfPrivacy');
  });

  it('includes data inventory', async () => {
    activatePremium();
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);

    const gen = createGenerator();
    const result = await gen.generate();
    expect(result.report!.dataInventory.totalEntities).toBeGreaterThanOrEqual(1);
  });

  it('includes privacy guarantees', async () => {
    activatePremium();
    const gen = createGenerator();
    const result = await gen.generate();
    expect(result.report!.privacyGuarantees).toHaveLength(7);
    expect(result.report!.privacyGuarantees[0]!.status).toBe('verified');
  });

  it('includes comparison statement', async () => {
    activatePremium();
    const gen = createGenerator();
    const result = await gen.generate();
    expect(result.report!.comparisonStatement).toBeDefined();
    expect(result.report!.comparisonStatement.generatedAt).toBeTruthy();
  });
});

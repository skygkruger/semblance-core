/**
 * Step 29 — PrivacyDashboardProvider tests (Commit 6).
 * Tests the single entry point for Privacy Dashboard UI data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { DatabaseHandle } from '@semblance/core/platform/types';
import { DataInventoryCollector } from '@semblance/core/privacy/data-inventory-collector';
import { NetworkActivityAggregator } from '@semblance/core/privacy/network-activity-aggregator';
import { ActionHistoryAggregator } from '@semblance/core/privacy/action-history-aggregator';
import { PrivacyGuaranteeChecker } from '@semblance/core/privacy/privacy-guarantee-checker';
import { ComparisonStatementGenerator } from '@semblance/core/privacy/comparison-statement-generator';
import { PrivacyDashboardProvider } from '@semblance/core/privacy/privacy-dashboard-provider';

let db: InstanceType<typeof Database>;
let provider: PrivacyDashboardProvider;

function createAuditLogTable(): void {
  db.exec(`
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      timestamp TEXT,
      action TEXT,
      direction TEXT,
      status TEXT,
      payload_hash TEXT,
      signature TEXT,
      chain_hash TEXT,
      metadata TEXT,
      estimated_time_saved_seconds INTEGER DEFAULT 0
    )
  `);
}

beforeEach(() => {
  db = new Database(':memory:');
  const dbHandle = db as unknown as DatabaseHandle;
  const collector = new DataInventoryCollector({ db: dbHandle });
  const networkAgg = new NetworkActivityAggregator({ db: dbHandle });
  const actionAgg = new ActionHistoryAggregator({ db: dbHandle });
  const guaranteeChecker = new PrivacyGuaranteeChecker();
  const comparisonGen = new ComparisonStatementGenerator({ dataInventoryCollector: collector });

  provider = new PrivacyDashboardProvider({
    dataInventoryCollector: collector,
    networkActivityAggregator: networkAgg,
    actionHistoryAggregator: actionAgg,
    privacyGuaranteeChecker: guaranteeChecker,
    comparisonStatementGenerator: comparisonGen,
  });
});

afterEach(() => {
  db.close();
});

describe('PrivacyDashboardProvider (Step 29)', () => {
  it('returns complete dashboard data with all sections', async () => {
    const data = await provider.getDashboardData();
    expect(data.inventory).toBeDefined();
    expect(data.networkActivity).toBeDefined();
    expect(data.actionHistory).toBeDefined();
    expect(data.guarantees).toBeDefined();
    expect(data.comparisonStatement).toBeDefined();
    expect(data.generatedAt).toBeTruthy();
  });

  it('includes inventory from collector', async () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e2')`);

    const data = await provider.getDashboardData();
    expect(data.inventory.totalEntities).toBe(2);
    expect(data.inventory.categories.find(c => c.category === 'emails')?.count).toBe(2);
  });

  it('network activity covers last 30 days', async () => {
    createAuditLogTable();
    const data = await provider.getDashboardData();
    const start = new Date(data.networkActivity.period.start);
    const end = new Date(data.networkActivity.period.end);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    // Should be approximately 30 days
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it('includes comparison statement', async () => {
    const data = await provider.getDashboardData();
    expect(data.comparisonStatement).toBeDefined();
    expect(data.comparisonStatement.generatedAt).toBeTruthy();
  });

  it('getComparisonStatementOnly returns just the comparison', async () => {
    db.exec(`CREATE TABLE indexed_emails (id TEXT PRIMARY KEY)`);
    db.exec(`INSERT INTO indexed_emails VALUES ('e1')`);

    const comparison = await provider.getComparisonStatementOnly();
    expect(comparison.segments).toBeDefined();
    expect(comparison.totalDataPoints).toBeGreaterThanOrEqual(1);
    expect(comparison.summaryText).toBeTruthy();
  });
});

// Privacy Dashboard Provider — Single entry point for Privacy Dashboard UI.
// Assembles data inventory, network activity, action history, guarantees, and comparison.
// CRITICAL: No networking imports.

import type { DataInventoryCollector } from './data-inventory-collector.js';
import type { NetworkActivityAggregator } from './network-activity-aggregator.js';
import type { ActionHistoryAggregator } from './action-history-aggregator.js';
import type { PrivacyGuaranteeChecker } from './privacy-guarantee-checker.js';
import type { ComparisonStatementGenerator } from './comparison-statement-generator.js';
import type { PrivacyDashboardData, ComparisonStatement } from './types.js';

export interface PrivacyDashboardProviderDeps {
  dataInventoryCollector: DataInventoryCollector;
  networkActivityAggregator: NetworkActivityAggregator;
  actionHistoryAggregator: ActionHistoryAggregator;
  privacyGuaranteeChecker: PrivacyGuaranteeChecker;
  comparisonStatementGenerator: ComparisonStatementGenerator;
}

/**
 * Provides all data needed by the Privacy Dashboard UI.
 * Free tier — no premium gate.
 */
export class PrivacyDashboardProvider {
  private deps: PrivacyDashboardProviderDeps;

  constructor(deps: PrivacyDashboardProviderDeps) {
    this.deps = deps;
  }

  /**
   * Get complete dashboard data including all sections.
   * Network activity covers the last 30 days.
   */
  async getDashboardData(): Promise<PrivacyDashboardData> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const period = {
      start: thirtyDaysAgo.toISOString(),
      end: now.toISOString(),
    };

    const inventory = this.deps.dataInventoryCollector.collect();
    const networkActivity = this.deps.networkActivityAggregator.aggregate(period);
    const actionHistory = this.deps.actionHistoryAggregator.aggregate();
    const guarantees = this.deps.privacyGuaranteeChecker.check();
    const comparisonStatement = await this.deps.comparisonStatementGenerator.generate();

    return {
      inventory,
      networkActivity,
      actionHistory,
      guarantees,
      comparisonStatement,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Lightweight accessor for just the comparison statement (used in digest).
   */
  async getComparisonStatementOnly(): Promise<ComparisonStatement> {
    return this.deps.comparisonStatementGenerator.generate();
  }
}

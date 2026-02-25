// Proof of Privacy Generator — Assembles and signs a complete privacy report.
// Premium-gated via PremiumGate.isFeatureAvailable('proof-of-privacy').
// CRITICAL: No networking imports.

import type { PremiumGate } from '../premium/premium-gate.js';
import type { DeviceIdentity } from '../attestation/types.js';
import type { DataInventoryCollector } from './data-inventory-collector.js';
import type { NetworkActivityAggregator } from './network-activity-aggregator.js';
import type { PrivacyGuaranteeChecker } from './privacy-guarantee-checker.js';
import type { ComparisonStatementGenerator } from './comparison-statement-generator.js';
import type { ProofOfPrivacyReport } from './types.js';

export interface ProofOfPrivacyGeneratorDeps {
  premiumGate: PremiumGate;
  dataInventoryCollector: DataInventoryCollector;
  networkActivityAggregator: NetworkActivityAggregator;
  privacyGuaranteeChecker: PrivacyGuaranteeChecker;
  comparisonStatementGenerator: ComparisonStatementGenerator;
  deviceIdentity: DeviceIdentity;
}

export interface GenerateResult {
  success: boolean;
  report?: ProofOfPrivacyReport;
  error?: string;
}

/**
 * Generates a Proof of Privacy report containing all privacy-relevant data.
 * Premium-gated: requires 'proof-of-privacy' feature.
 */
export class ProofOfPrivacyGenerator {
  private deps: ProofOfPrivacyGeneratorDeps;

  constructor(deps: ProofOfPrivacyGeneratorDeps) {
    this.deps = deps;
  }

  /**
   * Generate a complete Proof of Privacy report.
   */
  async generate(): Promise<GenerateResult> {
    if (!this.deps.premiumGate.isFeatureAvailable('proof-of-privacy')) {
      return {
        success: false,
        error: 'Proof of Privacy requires Digital Representative tier.',
      };
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const period = {
      start: thirtyDaysAgo.toISOString(),
      end: now.toISOString(),
    };

    const dataInventory = this.deps.dataInventoryCollector.collect();
    const networkActivity = this.deps.networkActivityAggregator.aggregate(period);
    const privacyGuarantees = this.deps.privacyGuaranteeChecker.check();
    const comparisonStatement = await this.deps.comparisonStatementGenerator.generate();

    const report: ProofOfPrivacyReport = {
      '@context': 'https://veridian.run/privacy/v1',
      '@type': 'ProofOfPrivacy',
      generatedAt: now.toISOString(),
      deviceId: this.deps.deviceIdentity.id,
      dataInventory,
      networkActivity,
      privacyGuarantees,
      comparisonStatement,
    };

    return { success: true, report };
  }
}

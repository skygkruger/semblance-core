// Privacy Dashboard — Barrel exports for Step 29.
// CRITICAL: No networking imports.

export { DataInventoryCollector } from './data-inventory-collector.js';
export { NetworkActivityAggregator } from './network-activity-aggregator.js';
export { ActionHistoryAggregator } from './action-history-aggregator.js';
export { PrivacyGuaranteeChecker } from './privacy-guarantee-checker.js';
export { ComparisonStatementGenerator } from './comparison-statement-generator.js';
export { ProofOfPrivacyGenerator } from './proof-of-privacy-generator.js';
export { ProofOfPrivacyExporter } from './proof-of-privacy-exporter.js';
export { PrivacyDashboardProvider } from './privacy-dashboard-provider.js';
export { PrivacyTracker } from './privacy-tracker.js';

export type {
  DataInventory,
  DataCategoryCount,
  NetworkActivitySummary,
  ServiceActivity,
  ActionHistorySummary,
  PrivacyGuarantee,
  ComparisonSegment,
  ComparisonStatement,
  ProofOfPrivacyReport,
  SignedProofOfPrivacy,
  ProofOfPrivacyExportResult,
  ProofOfPrivacyVerificationResult,
  PrivacyDashboardData,
} from './types.js';

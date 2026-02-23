// Finance barrel — free-tier exports only.
// DR-tier modules (TransactionStore, SpendingAnalyzer, AnomalyDetector, etc.)
// are imported directly by the @semblance/dr extension package, not re-exported here.

export { StatementParser } from './statement-parser.js';
export type { Transaction as ParsedTransaction, StatementImport, CSVParseOptions } from './statement-parser.js';

export { MerchantNormalizer } from './merchant-normalizer.js';

export { RecurringDetector } from './recurring-detector.js';
export type { RecurringCharge, SubscriptionSummary } from './recurring-detector.js';

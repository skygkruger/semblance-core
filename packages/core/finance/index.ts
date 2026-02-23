export { StatementParser } from './statement-parser.js';
export type { Transaction as ParsedTransaction, StatementImport, CSVParseOptions } from './statement-parser.js';

export { MerchantNormalizer } from './merchant-normalizer.js';

export { RecurringDetector } from './recurring-detector.js';
export type { RecurringCharge, SubscriptionSummary } from './recurring-detector.js';

export { TransactionStore } from './transaction-store.js';
export type {
  Transaction,
  TransactionSource,
  Account,
  TransactionFilter,
  CategorySpending,
  MonthlyTotals,
} from './transaction-store.js';

export { ImportPipeline, NoOpCategorizationQueue } from './import-pipeline.js';
export type { CategorizationQueueLike, ImportResult } from './import-pipeline.js';

export { CATEGORY_TAXONOMY, getValidCategories, getSubcategories, isValidCategory } from './category-taxonomy.js';
export type { CategoryDefinition } from './category-taxonomy.js';

export { LLMCategorizer } from './llm-categorizer.js';
export type { UncategorizedTransaction, CategorizationResult } from './llm-categorizer.js';

export { CategorizationQueue } from './categorization-queue.js';

export { SpendingAnalyzer } from './spending-analyzer.js';
export type {
  MonthlyBreakdown,
  MonthComparison,
  CategoryChange,
  SpendingTrend,
  MerchantSpending,
  SpendingInsight,
} from './spending-analyzer.js';

export { AnomalyStore } from './anomaly-store.js';
export type { Anomaly, AnomalyType, AnomalySeverity } from './anomaly-store.js';

export { AnomalyDetector } from './anomaly-detector.js';

export { FinancialInsightTracker } from './financial-insight-tracker.js';

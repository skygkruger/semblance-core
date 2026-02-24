# Step 19 — Full Financial Awareness

## Implementation Prompt for Claude Code

**Date:** February 22, 2026
**Context:** Steps 1–18 complete. Step 18 delivered Cloud Storage Sync (Google Drive) with 65 new tests. Sprint 4 continues — "Becomes Part of You." This step delivers full financial intelligence: LLM-based transaction categorization, spending insights with trends, anomaly detection, Plaid integration for real-time bank data, financial dashboard, and proactive financial insights in Universal Inbox. This is the **first Digital Representative feature** — free tier retains subscription detection only; everything else requires the Digital Representative tier (internally: `semblance-premium`).
**Test Baseline:** 3,086 tests passing across ~215 files. Privacy audit clean. TypeScript compilation clean (`npx tsc --noEmit` → EXIT_CODE=0).
**Architecture Note:** Financial data is the most sensitive data Semblance handles. Bank transactions, account balances, spending patterns — this is deeply personal information. Every design decision must assume the user treats this data as more sensitive than their emails. Plaid tokens are stored encrypted in the Gateway credential store. Transaction data is stored locally in SQLite. All categorization and analysis runs through the local LLM. Zero cloud processing of financial data.
**Builds On:** Sprint 2 delivered subscription detection (working), merchant normalizer (60+ merchants), and CSV/OFX transaction parsing. This step upgrades the stub into a full system.
**Rule:** ZERO stubs, ZERO placeholders, ZERO deferrals. Every deliverable ships production-ready.

---

## Read First

Before writing any code, read these files:

- `/CLAUDE.md` — Architecture rules, boundary rules, 5 inviolable rules, IPC protocol
- `/docs/DESIGN_SYSTEM.md` — All UI must conform to Trellis design system
- `packages/core/types/ipc.ts` — ActionType enum (finance.fetch_transactions already exists)
- `packages/core/agent/ipc-client.ts` — IPCClient for Core → Gateway communication
- `packages/core/agent/orchestrator.ts` — Where financial query tools are wired
- `packages/core/agent/proactive-engine.ts` — ProactiveInsight type union (financial insights)
- `packages/core/agent/types.ts` — AutonomyDomain union
- `packages/core/agent/autonomy.ts` — ACTION_DOMAIN_MAP + ACTION_RISK_MAP (exhaustive records)
- `packages/core/knowledge/indexer.ts` — Indexer.indexDocument() with DocumentSource
- `packages/core/llm/inference-router.ts` — InferenceRouter for LLM-based categorization
- `packages/gateway/services/` — Service adapter pattern
- `packages/gateway/credentials/encryption.ts` — Token encryption for Plaid
- Find and read ALL existing financial/subscription code from Sprint 2:
  - Search for `subscription`, `transaction`, `merchant`, `finance` across the codebase
  - Identify the merchant normalizer, CSV/OFX parser, subscription detector
  - Understand what exists before building on top of it

**CRITICAL: Map the existing Sprint 2 financial code before writing anything.** The build prompt references "subscription detection (working), merchant normalizer (60+ merchants), CSV/OFX parsing" from the capability audit. Find these files, read them, understand their interfaces. Step 19 extends them — it does not replace them.

---

## Why This Step Matters — The Moat Argument

Financial awareness is the feature that makes users trust Semblance with their most sensitive data — and once they do, switching costs become enormous.

Cloud AI has no access to your bank transactions. You can paste a CSV into ChatGPT and ask it to categorize your spending, but it forgets everything next conversation. Semblance ingests your financial data once, stores it locally forever, and builds a persistent understanding of your spending patterns. "You spent 40% more on dining out this month" isn't a one-time analysis — it's continuous awareness that compounds over time.

The subscription detection from Sprint 2 already works. Step 19 transforms it from a standalone feature into the foundation of a financial intelligence system:

- **Transaction categorization:** Every transaction classified by the local LLM using merchant context + amount + frequency. Not just "Food" — but "Fast food vs groceries vs dining out." The LLM understands that "UBER EATS" is dining, not transportation.
- **Spending insights:** Monthly breakdowns, category trends, month-over-month comparisons. "Your utilities jumped 23% — could be seasonal, but worth checking."
- **Anomaly detection:** First-time merchants, unusual amounts, pattern breaks. "New charge: $847 from ACME CORP — you've never paid this merchant before."
- **Proactive integration:** Financial insights surface in Universal Inbox alongside email, calendar, and everything else. "Three subscriptions renew this week totaling $47.97."

The feature gate is critical: free tier keeps subscription detection (the hook), the Digital Representative tier unlocks full financial intelligence (the value). This is the first gated feature — it establishes the pattern that Steps 20–22 follow.

**Naming convention:** Internally, the code uses `PremiumGate`, `LicenseTier`, `isPremium()` — these are implementation details. In ALL user-facing strings (UI labels, upgrade prompts, settings text, dashboard copy), the paid tier is called **"Digital Representative"** — never "Premium." The Digital Representative is an advocate that works on the user's behalf, not a paywall. This distinction is non-negotiable.

**Privacy guarantee:** Plaid tokens encrypted in Gateway credential store. All transaction data stored locally in SQLite. LLM categorization runs on-device. Zero cloud processing. The user's bank data never leaves their machine.

---

## Scope Overview

| Section | Description | Test Target |
|---------|-------------|-------------|
| A | Transaction Store + Import Pipeline (extends Sprint 2) | 10+ |
| B | LLM Transaction Categorization | 10+ |
| C | Spending Insights + Trends | 10+ |
| D | Anomaly Detection | 8+ |
| E | Plaid Integration (Gateway) | 10+ |
| F | Feature Gate (Digital Representative) | 6+ |
| G | Autonomy + Orchestrator + ProactiveEngine | 8+ |
| H | Financial Dashboard UI + Settings | 8+ |
| I | Privacy Audit + Integration Tests | 5+ |

**Minimum 70 new tests. Target 75+.**

---

## Section A: Transaction Store + Import Pipeline

### A1: TransactionStore

Create `packages/core/finance/transaction-store.ts`:

```typescript
/**
 * Persistent storage for financial transactions.
 *
 * SQLite table: transactions
 * Columns: id, source ('csv_import' | 'ofx_import' | 'plaid' | 'manual'),
 *          accountId, date (Unix ms), merchantRaw, merchantNormalized,
 *          amount (cents — integer to avoid float precision), currency,
 *          category, subcategory, isRecurring, isSubscription,
 *          plaidTransactionId?, metadata (JSON), createdAt, updatedAt
 *
 * SQLite table: accounts
 * Columns: id, name, institution, type ('checking' | 'savings' | 'credit' | 'other'),
 *          plaidAccountId?, lastSyncedAt, createdAt
 *
 * All amounts stored in cents (integer). $14.99 → 1499.
 * This avoids all floating-point precision issues.
 *
 * Extends the Sprint 2 subscription detection by storing the full
 * transaction history, not just detected subscriptions.
 */
export class TransactionStore {
  constructor(private db: DatabaseHandle) {}

  // Transaction CRUD
  async addTransactions(txns: Transaction[]): Promise<void>;
  async getTransaction(id: string): Promise<Transaction | null>;
  async getTransactions(filter: TransactionFilter): Promise<Transaction[]>;
  async updateCategory(id: string, category: string, subcategory?: string): Promise<void>;
  async getTransactionCount(): Promise<number>;

  // Account management
  async addAccount(account: Account): Promise<void>;
  async getAccounts(): Promise<Account[]>;
  async getAccount(id: string): Promise<Account | null>;
  async updateAccountSync(id: string, lastSyncedAt: number): Promise<void>;

  // Aggregation queries
  async getMonthlySpending(year: number, month: number): Promise<CategorySpending[]>;
  async getSpendingByCategory(startDate: number, endDate: number): Promise<CategorySpending[]>;
  async getMonthOverMonth(months: number): Promise<MonthlyTotals[]>;
  async getMerchantHistory(merchantNormalized: string): Promise<Transaction[]>;
  async getRecentTransactions(limit: number): Promise<Transaction[]>;
}

export interface Transaction {
  id: string;
  source: TransactionSource;
  accountId: string;
  date: number; // Unix ms
  merchantRaw: string;
  merchantNormalized: string;
  amount: number; // Cents (integer). Negative = expense, positive = income.
  currency: string; // ISO 4217
  category: string;
  subcategory?: string;
  isRecurring: boolean;
  isSubscription: boolean;
  plaidTransactionId?: string;
  metadata?: Record<string, unknown>;
}

export type TransactionSource = 'csv_import' | 'ofx_import' | 'plaid' | 'manual';

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: 'checking' | 'savings' | 'credit' | 'other';
  plaidAccountId?: string;
  lastSyncedAt?: number;
}

export interface TransactionFilter {
  accountId?: string;
  startDate?: number;
  endDate?: number;
  category?: string;
  merchantNormalized?: string;
  minAmount?: number;
  maxAmount?: number;
  source?: TransactionSource;
  limit?: number;
  offset?: number;
}

export interface CategorySpending {
  category: string;
  subcategory?: string;
  totalCents: number;
  transactionCount: number;
  percentOfTotal: number;
}

export interface MonthlyTotals {
  year: number;
  month: number;
  totalSpendingCents: number;
  totalIncomeCents: number;
  categoryBreakdown: CategorySpending[];
}
```

### A2: Import Pipeline Extension

The Sprint 2 CSV/OFX parsers produce raw transactions. Create `packages/core/finance/import-pipeline.ts`:

```typescript
/**
 * Unified import pipeline:
 * 1. Accepts parsed transactions from CSV/OFX parsers (Sprint 2)
 * 2. Runs merchant normalizer (Sprint 2, 60+ merchants)
 * 3. Deduplicates against existing transactions
 * 4. Stores in TransactionStore
 * 5. Queues for LLM categorization (Section B)
 * 6. Updates subscription detector (Sprint 2)
 *
 * Deduplication: match on (accountId, date, merchantRaw, amount).
 * Existing transactions are not overwritten.
 */
export class ImportPipeline {
  constructor(
    private transactionStore: TransactionStore,
    private merchantNormalizer: MerchantNormalizer, // Sprint 2
    private categorizationQueue: CategorizationQueue
  ) {}

  async importFromCSV(csvData: string, accountId: string): Promise<ImportResult>;
  async importFromOFX(ofxData: string, accountId: string): Promise<ImportResult>;
  async importFromPlaid(transactions: PlaidTransaction[], accountId: string): Promise<ImportResult>;
}

export interface ImportResult {
  imported: number;
  duplicatesSkipped: number;
  errors: number;
  queuedForCategorization: number;
}
```

**Tests (10+):** `tests/core/finance/transaction-store.test.ts` (6) + `tests/core/finance/import-pipeline.test.ts` (4)
- Store: add transactions, retrieve by ID
- Store: filter by date range
- Store: filter by category
- Store: getMonthlySpending returns correct totals (amounts in cents)
- Store: getMonthOverMonth returns correct trend data
- Store: deduplication on (accountId, date, merchant, amount)
- Import: CSV → normalized → stored → queued
- Import: OFX → normalized → stored → queued
- Import: duplicates skipped correctly
- Import: Plaid transactions → normalized → stored

---

## Section B: LLM Transaction Categorization

### B1: Category Taxonomy

Create `packages/core/finance/category-taxonomy.ts`:

```typescript
/**
 * Local category taxonomy for transaction categorization.
 *
 * Two-level: category → subcategory.
 * The LLM classifies into this taxonomy. Users can override.
 *
 * Categories:
 * - Housing: rent, mortgage, insurance, maintenance, utilities
 * - Transportation: fuel, public transit, rideshare, parking, car payment, car insurance
 * - Food & Dining: groceries, restaurants, fast food, coffee, delivery
 * - Shopping: clothing, electronics, home goods, general
 * - Entertainment: streaming, gaming, movies, events, hobbies
 * - Health: insurance, pharmacy, doctor, fitness, dental, vision
 * - Personal: haircut, laundry, education, childcare
 * - Financial: bank fees, interest, investment, tax
 * - Subscriptions: software, media, services, memberships
 * - Income: salary, freelance, refund, transfer
 * - Other: uncategorized
 */
export const CATEGORY_TAXONOMY: CategoryDefinition[];

export interface CategoryDefinition {
  category: string;
  subcategories: string[];
  keywords: string[]; // Hints for LLM and fallback rule-based matching
}

/** Get flat list of all valid categories */
export function getValidCategories(): string[];

/** Get subcategories for a category */
export function getSubcategories(category: string): string[];

/** Validate a category/subcategory pair */
export function isValidCategory(category: string, subcategory?: string): boolean;
```

### B2: LLM Categorizer

Create `packages/core/finance/llm-categorizer.ts`:

```typescript
/**
 * Uses the local LLM to categorize transactions.
 *
 * Batch processing: groups transactions and sends them to the LLM
 * in batches of 10-20 for efficiency. Single LLM call categorizes
 * multiple transactions.
 *
 * Prompt design:
 * - System: "You are a financial transaction categorizer. Classify each
 *   transaction into exactly one category and subcategory from the provided
 *   taxonomy. Respond in JSON format."
 * - User: batch of transactions with merchant name, amount, date
 * - Expected response: JSON array of { transactionId, category, subcategory }
 *
 * Fallback: if LLM is unavailable or response is unparseable, use
 * rule-based categorization from merchant normalizer keywords.
 *
 * The LLM sees merchant name + amount + date. It does NOT see
 * account numbers, balances, or other sensitive financial details
 * beyond what's needed for categorization.
 *
 * IMPORTANT: Uses the fast classification model (sub-1-second)
 * from InferenceRouter, not the primary reasoning model.
 * Categorization is a classification task, not a reasoning task.
 */
export class LLMCategorizer {
  constructor(
    private inferenceRouter: InferenceRouter,
    private taxonomy: CategoryDefinition[]
  ) {}

  /** Categorize a batch of transactions */
  async categorizeBatch(transactions: UncategorizedTransaction[]): Promise<CategorizationResult[]>;

  /** Categorize a single transaction (wraps batch of 1) */
  async categorize(transaction: UncategorizedTransaction): Promise<CategorizationResult>;

  /** Rule-based fallback using merchant keywords */
  fallbackCategorize(merchantNormalized: string, amount: number): CategorizationResult;
}

export interface UncategorizedTransaction {
  id: string;
  merchantNormalized: string;
  amount: number;
  date: number;
}

export interface CategorizationResult {
  transactionId: string;
  category: string;
  subcategory?: string;
  confidence: number; // 0-1
  method: 'llm' | 'rule-based' | 'user-override';
}
```

### B3: Categorization Queue

Create `packages/core/finance/categorization-queue.ts`:

```typescript
/**
 * Background queue for transaction categorization.
 *
 * When transactions are imported, they're queued for categorization.
 * The queue processes batches during idle time (not blocking UI).
 *
 * Processing strategy:
 * - Batch size: 15 transactions per LLM call
 * - Process during idle (requestIdleCallback pattern)
 * - Retry failed categorizations up to 3 times
 * - Mark as 'Other/uncategorized' after 3 failures
 */
export class CategorizationQueue {
  constructor(
    private categorizer: LLMCategorizer,
    private transactionStore: TransactionStore
  ) {}

  async enqueue(transactionIds: string[]): Promise<void>;
  async processNext(): Promise<number>; // Returns number processed
  async processPending(): Promise<number>; // Process all pending
  async getPendingCount(): Promise<number>;
  startBackgroundProcessing(): void;
  stopBackgroundProcessing(): void;
}
```

**Tests (10+):** `tests/core/finance/category-taxonomy.test.ts` (3) + `tests/core/finance/llm-categorizer.test.ts` (4) + `tests/core/finance/categorization-queue.test.ts` (3)
- Taxonomy: all categories have subcategories
- Taxonomy: `isValidCategory` validates correctly
- Taxonomy: `getValidCategories` returns complete list
- LLM categorizer: batch of transactions → categories returned
- LLM categorizer: response parsed correctly as JSON
- LLM categorizer: invalid LLM response → fallback to rule-based
- LLM categorizer: fallback categorization by merchant keywords
- Queue: enqueue → processNext → transactions categorized in store
- Queue: pending count decreases after processing
- Queue: failed categorization retries then marks as Other

---

## Section C: Spending Insights + Trends

### C1: SpendingAnalyzer

Create `packages/core/finance/spending-analyzer.ts`:

```typescript
/**
 * Computes spending insights from transaction history.
 *
 * All computation is local. Pure functions over TransactionStore data.
 * No LLM needed — this is arithmetic + aggregation.
 *
 * Insights generated:
 * - Monthly spending by category (pie chart data)
 * - Month-over-month trend (line chart data)
 * - Category comparison: "40% more on dining this month vs last"
 * - Top merchants by spending
 * - Average daily spending
 * - Recurring vs one-time spending ratio
 */
export class SpendingAnalyzer {
  constructor(private transactionStore: TransactionStore) {}

  /** Get spending breakdown for a month */
  async getMonthlyBreakdown(year: number, month: number): Promise<MonthlyBreakdown>;

  /** Get month-over-month comparison */
  async getMonthComparison(currentYear: number, currentMonth: number): Promise<MonthComparison>;

  /** Get spending trends over N months */
  async getSpendingTrends(months: number): Promise<SpendingTrend[]>;

  /** Get top merchants by spending for a period */
  async getTopMerchants(startDate: number, endDate: number, limit: number): Promise<MerchantSpending[]>;

  /** Generate natural language insights for a month */
  async generateInsights(year: number, month: number): Promise<SpendingInsight[]>;
}

export interface MonthlyBreakdown {
  year: number;
  month: number;
  totalSpendingCents: number;
  totalIncomeCents: number;
  categories: CategorySpending[];
  dailyAverage: number;
  transactionCount: number;
}

export interface MonthComparison {
  current: MonthlyBreakdown;
  previous: MonthlyBreakdown;
  changePercent: number; // Overall spending change
  categoryChanges: CategoryChange[];
}

export interface CategoryChange {
  category: string;
  currentCents: number;
  previousCents: number;
  changePercent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface SpendingTrend {
  year: number;
  month: number;
  totalCents: number;
}

export interface MerchantSpending {
  merchantNormalized: string;
  totalCents: number;
  transactionCount: number;
  lastDate: number;
}

export interface SpendingInsight {
  type: 'category-increase' | 'category-decrease' | 'new-recurring' | 'subscription-renewal' | 'high-spending-day';
  title: string; // "Dining up 40% this month"
  description: string; // "You've spent $320 on dining out, compared to $228 last month."
  severity: 'info' | 'warning';
  category?: string;
  amountCents?: number;
}
```

**Tests (10+):** `tests/core/finance/spending-analyzer.test.ts`
- Monthly breakdown: correct totals in cents
- Monthly breakdown: correct category percentages
- Month comparison: calculates change percent
- Month comparison: identifies category increases/decreases
- Spending trends: returns correct data for N months
- Top merchants: sorted by spending descending
- Generate insights: identifies category increase above threshold
- Generate insights: flags subscription renewals this week
- Daily average calculation correct
- Handles months with zero transactions gracefully

---

## Section D: Anomaly Detection

### D1: AnomalyDetector

Create `packages/core/finance/anomaly-detector.ts`:

```typescript
/**
 * Detects unusual transactions and spending patterns.
 *
 * Anomaly types:
 * 1. First-time merchant: "New charge from ACME CORP — first time."
 * 2. Unusual amount: charge significantly higher than typical for this merchant
 *    (e.g., normally $12 at Starbucks, today $87)
 * 3. Unusual category spike: sudden increase in a category (e.g., 3x normal)
 * 4. Duplicate charge: same merchant + amount within 24 hours (possible double-charge)
 * 5. Weekend/off-hours large charge: large charge at unusual time
 *
 * All detection is rule-based + statistical. No LLM needed.
 * Uses historical transaction data to establish "normal" patterns.
 *
 * Minimum data requirement: anomaly detection activates after 30+ transactions
 * in the store. Before that, there's not enough data for meaningful patterns.
 */
export class AnomalyDetector {
  constructor(private transactionStore: TransactionStore) {}

  /** Scan recent transactions for anomalies */
  async detectAnomalies(transactions: Transaction[]): Promise<Anomaly[]>;

  /** Check a single transaction against historical patterns */
  async checkTransaction(transaction: Transaction): Promise<Anomaly | null>;

  /** Get all unresolved anomalies */
  async getActiveAnomalies(): Promise<Anomaly[]>;

  /** Dismiss an anomaly (user reviewed and it's fine) */
  async dismissAnomaly(anomalyId: string): Promise<void>;
}

export interface Anomaly {
  id: string;
  transactionId: string;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high';
  title: string; // "First-time merchant: ACME CORP"
  description: string; // "You've never paid this merchant before. Charge: $847.00"
  detectedAt: number;
  dismissed: boolean;
}

export type AnomalyType =
  | 'first-time-merchant'
  | 'unusual-amount'
  | 'category-spike'
  | 'duplicate-charge'
  | 'large-off-hours';
```

### D2: Anomaly Store

Create `packages/core/finance/anomaly-store.ts`:

```typescript
/**
 * SQLite table: financial_anomalies
 * Tracks detected anomalies with dismiss state.
 */
export class AnomalyStore {
  constructor(private db: DatabaseHandle) {}

  async saveAnomaly(anomaly: Anomaly): Promise<void>;
  async getActiveAnomalies(): Promise<Anomaly[]>;
  async dismissAnomaly(id: string): Promise<void>;
  async getAnomalyByTransaction(transactionId: string): Promise<Anomaly | null>;
}
```

**Tests (8+):** `tests/core/finance/anomaly-detector.test.ts` (5) + `tests/core/finance/anomaly-store.test.ts` (3)
- First-time merchant detected
- Unusual amount: $87 at a merchant where typical is $12
- Duplicate charge: same merchant + amount within 24 hours
- Category spike: 3x normal spending in a category
- No anomalies when < 30 transactions (minimum data requirement)
- Store: save and retrieve anomaly
- Store: dismiss anomaly
- Store: getActiveAnomalies excludes dismissed

---

## Section E: Plaid Integration (Gateway)

### E1: Plaid Gateway Adapter

Create `packages/gateway/services/plaid-adapter.ts`:

```typescript
/**
 * Gateway-side Plaid adapter for real-time bank data.
 *
 * Plaid flow:
 * 1. Core sends 'finance.plaid_link' action
 * 2. Gateway opens Plaid Link in webview/browser
 * 3. User selects bank, authenticates, grants access
 * 4. Plaid returns a public_token
 * 5. Gateway exchanges public_token for access_token
 * 6. Access token stored encrypted in credential store
 * 7. Gateway uses access_token to fetch transactions
 *
 * API calls:
 * - /transactions/sync — incremental transaction sync
 * - /accounts/balance/get — current account balances
 * - /item/get — connection status
 * - /item/remove — disconnect
 *
 * Rate limiting: Plaid has generous limits for production.
 * Gateway enforces reasonable limits anyway (sync: 4/hr, balance: 12/hr).
 *
 * CRITICAL: Plaid access_token stored encrypted.
 * Transaction data is returned to Core via IPC and stored in
 * TransactionStore (SQLite). Plaid never sees the categorized data.
 *
 * Plaid is Digital Representative exclusive: requires the Digital Representative tier AND
 * a Plaid-capable plan. The free tier can still
 * import CSV/OFX manually.
 */
export class PlaidAdapter {
  constructor(
    private credentialStore: CredentialStore,
    private auditTrail: AuditTrail,
    private rateLimiter: RateLimiter
  ) {}

  /** Initiate Plaid Link flow */
  async createLinkToken(): Promise<PlaidLinkResult>;

  /** Exchange public token for access token after user completes Link */
  async exchangePublicToken(publicToken: string): Promise<void>;

  /** Sync transactions (incremental — uses cursor) */
  async syncTransactions(cursor?: string): Promise<PlaidSyncResult>;

  /** Get account balances */
  async getBalances(): Promise<PlaidBalance[]>;

  /** Check connection status */
  async getConnectionStatus(): Promise<PlaidConnectionStatus>;

  /** Disconnect from Plaid (remove item) */
  async disconnect(): Promise<void>;
}

export interface PlaidLinkResult {
  linkToken: string;
  expiration: string;
}

export interface PlaidSyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: string[]; // Transaction IDs removed
  cursor: string; // For next incremental sync
  hasMore: boolean;
}

export interface PlaidTransaction {
  transactionId: string;
  accountId: string;
  date: string; // YYYY-MM-DD
  merchantName: string;
  amount: number; // Plaid uses positive = expense
  currency: string;
  category?: string[]; // Plaid's categories (we override with our own)
}

export interface PlaidBalance {
  accountId: string;
  current: number;
  available?: number;
  currency: string;
}

export type PlaidConnectionStatus = 'connected' | 'error' | 'needs_reauth' | 'disconnected';
```

### E2: IPC ActionTypes for Plaid

Add to `packages/core/types/ipc.ts` — **atomically with all exhaustive record entries:**

```typescript
'finance.plaid_link'          // Create Plaid Link token
'finance.plaid_exchange'      // Exchange public token for access token
'finance.plaid_sync'          // Sync transactions from Plaid
'finance.plaid_balances'      // Get account balances
'finance.plaid_status'        // Check connection status
'finance.plaid_disconnect'    // Disconnect from Plaid
```

That's 6 new ActionTypes. Plus the existing `finance.fetch_transactions`. Total finance domain: 7 action types.

**CRITICAL: All exhaustive Record entries must be updated atomically in the same commit.** Add ALL 6 new ActionTypes AND their entries in ActionPayloadMap, ACTION_DOMAIN_MAP, ACTION_RISK_MAP, and TIME_SAVED_DEFAULTS in a single commit.

Risk classification:
- `finance.plaid_link` → `'write'` (grants bank access — requires approval)
- `finance.plaid_exchange` → `'write'` (token exchange)
- `finance.plaid_sync` → `'read'` (pull-only, like cloud storage)
- `finance.plaid_balances` → `'read'`
- `finance.plaid_status` → `'read'`
- `finance.plaid_disconnect` → `'write'` (revokes access)

Time-saved defaults:
- `finance.plaid_sync` → `120` (2 minutes saved vs manual download + import)
- `finance.plaid_balances` → `30`
- Others → `5`

**Tests (10+):** `tests/gateway/plaid-adapter.test.ts` (6) + `tests/core/finance/plaid-ipc.test.ts` (4)
- Link token creation returns valid structure
- Public token exchange stores encrypted access token
- Transaction sync returns PlaidSyncResult with cursor
- Balance retrieval returns PlaidBalance array
- Connection status reports correctly
- Disconnect revokes and clears tokens
- IPC: all 6 plaid action types in ActionType enum
- IPC: ActionPayloadMap has entries for all 6
- IPC: ACTION_RISK_MAP: plaid_link = 'write', plaid_sync = 'read'
- IPC: TIME_SAVED_DEFAULTS has entries for all 6

---

## Section F: Feature Gate (Internal: PremiumGate / User-Facing: Digital Representative)

### F1: PremiumGate

Create `packages/core/premium/premium-gate.ts`:

```typescript
/**
 * Controls access to Digital Representative features.
 *
 * This is the first feature gate in Semblance. It establishes the pattern
 * for Steps 20-22.
 *
 * Gate logic:
 * - Check for Digital Representative license/subscription status
 * - If Digital Representative tier: all features available
 * - If free: only subscription detection available from finance features
 *
 * License storage: SQLite table 'license' with fields:
 * tier ('free' | 'digital-representative' | 'lifetime'), activatedAt, expiresAt, licenseKey
 *
 * For now: license validation is local (check key format + expiry).
 * No license server. No phone-home. The license file is a signed JWT
 * that can be validated offline.
 *
 * IMPORTANT: Digital Representative features are GATED, not ABSENT.
 * The code exists in the same codebase. The gate controls access.
 * This is open-core: the community sees the code, they just
 * can't activate it without a license.
 *
 * NAMING: Internal code uses PremiumGate, isPremium(), LicenseTier.
 * ALL user-facing strings use "Digital Representative" — never "Premium."
 */
export class PremiumGate {
  constructor(private db: DatabaseHandle) {}

  /** Check if user has premium access */
  async isPremium(): Promise<boolean>;

  /** Get current license tier */
  async getLicenseTier(): Promise<LicenseTier>;

  /** Activate a license key */
  async activateLicense(licenseKey: string): Promise<ActivationResult>;

  /** Check if a specific feature is available */
  async isFeatureAvailable(feature: PremiumFeature): Promise<boolean>;

  /** Get all available features for current tier */
  async getAvailableFeatures(): Promise<PremiumFeature[]>;
}

export type LicenseTier = 'free' | 'digital-representative' | 'lifetime';

export type PremiumFeature =
  | 'transaction-categorization'
  | 'spending-insights'
  | 'anomaly-detection'
  | 'plaid-integration'
  | 'financial-dashboard'
  | 'subscription-cancellation'   // Step 20
  | 'form-automation'             // Step 21
  | 'health-tracking'             // Step 22
  | 'digital-representative';     // Step 20

export interface ActivationResult {
  success: boolean;
  tier: LicenseTier;
  expiresAt?: number;
  error?: string;
}
```

### F2: Gate Integration

The gate is checked at the feature entry points:
- SpendingAnalyzer: checks `isFeatureAvailable('spending-insights')` before computing
- AnomalyDetector: checks `isFeatureAvailable('anomaly-detection')` before scanning
- LLMCategorizer: checks `isFeatureAvailable('transaction-categorization')` before categorizing
- PlaidAdapter: checks `isFeatureAvailable('plaid-integration')` before connecting
- Financial Dashboard: renders subscription detection for free tier; full dashboard for Digital Representative tier

Free tier sees:
- Subscription detection (Sprint 2, already working)
- "Activate your Digital Representative — Semblance works on your behalf to track your spending, flag unusual charges, and protect you from dark patterns." prompt in dashboard

**Tests (6+):** `tests/core/premium/premium-gate.test.ts`
- Free tier: isPremium returns false
- Premium tier: isPremium returns true
- Free tier: spending-insights not available
- Premium tier: spending-insights available
- License activation with valid key → digital-representative tier
- License activation with invalid key → error

---

## Section G: Autonomy + Orchestrator + ProactiveEngine

### G1: Autonomy Domain Extension

The `'finance'` domain should already exist from Sprint 2 (it has `finance.fetch_transactions`). If it does, extend it. If not, add it. **Verify by reading the actual code.**

Add the 6 new Plaid actions to the existing finance domain mappings. All atomically.

### G2: Orchestrator Tools

Add financial query tools to the Orchestrator:

- `query_spending` — "How much did I spend on dining last month?" → SpendingAnalyzer
- `query_transactions` — "Show me my recent transactions" → TransactionStore
- `query_anomalies` — "Any unusual charges?" → AnomalyDetector
- `query_subscriptions` — "What subscriptions do I have?" → existing subscription detector

All query tools are LOCAL_TOOLS (no Gateway needed — queries against local SQLite).

### G3: ProactiveEngine Integration

Add financial insight types to ProactiveInsight:
- `'spending-alert'` — "You've spent 40% more on dining this month"
- `'anomaly-alert'` — "New charge: $847 from ACME CORP"
- `'subscription-renewal'` — "3 subscriptions renew this week ($47.97)"
- `'balance-low'` — "Checking account balance dropped below $500" (Plaid only)

Create `FinancialInsightTracker` following the pattern of existing insight trackers (BirthdayTracker, LocationInsightTracker, etc.). Wire into ProactiveEngine.

**Tests (8+):** `tests/core/finance/finance-autonomy.test.ts` (3) + `tests/core/finance/orchestrator-finance.test.ts` (3) + `tests/core/finance/financial-insight-tracker.test.ts` (2)
- All finance/plaid actions in ACTION_DOMAIN_MAP
- Plaid actions risk-classified correctly
- getConfig includes finance domain
- `query_spending` returns monthly breakdown
- `query_transactions` returns filtered transactions
- `query_anomalies` returns active anomalies
- ProactiveEngine generates spending-alert insight
- ProactiveEngine generates anomaly-alert for first-time merchant

---

## Section H: Financial Dashboard UI + Settings

### H1: Financial Dashboard

Create `packages/desktop/src/components/FinancialDashboard.tsx`:

```typescript
/**
 * Full financial dashboard (Digital Representative feature).
 *
 * Layout:
 * - Top bar: month selector, total spending, total income
 * - Spending breakdown: donut/pie chart by category
 * - Trend line: month-over-month spending (6 months)
 * - Anomalies: card list of active anomalies with dismiss
 * - Subscriptions: list with renewal dates and costs
 * - Recent transactions: scrollable list with category tags
 *
 * Free tier: shows subscription list only, with Digital Representative activation prompt.
 * Digital Representative: full dashboard with all sections.
 *
 * Trellis design system. Chart data from SpendingAnalyzer.
 * No external charting library — use SVG or CSS-based charts.
 */
```

### H2: Finance Settings

Create `packages/desktop/src/components/FinanceSettingsSection.tsx`:
- Import CSV/OFX button
- Plaid connection card (Digital Representative only, with activation prompt for free tier)
- Connected accounts list
- Auto-sync toggle (Plaid, default: daily)
- Category management (view/edit categories)
- Anomaly sensitivity (low/medium/high)

### H3: Mobile Finance

Create `packages/mobile/src/screens/FinancialDashboardScreen.tsx`:
- Mobile-optimized version of the dashboard
- Swipe between months
- Simplified charts

### H4: AppState Extension

Modify `packages/desktop/src/state/AppState.tsx`:
- Add `financeSettings` to AppState: `{ plaidConnected, autoSyncEnabled, anomalySensitivity, lastImportAt }`
- Add `SET_FINANCE_SETTINGS` action + reducer

**Tests (8+):** `tests/desktop/financial-dashboard.test.ts` (4) + `tests/desktop/finance-settings.test.ts` (2) + `tests/core/finance/finance-settings-state.test.ts` (2)
- Dashboard renders category breakdown
- Dashboard shows anomalies with dismiss button
- Dashboard: free tier shows subscription list + Digital Representative activation prompt
- Dashboard: Digital Representative tier shows full dashboard
- Settings: import CSV button triggers import pipeline
- Settings: Plaid connect shows Digital Representative activation prompt for free tier
- AppState initial finance settings correct
- Reducer updates state

---

## Section I: Privacy Audit + Integration Tests

### I1: Privacy Test Suite

Create `tests/privacy/finance-privacy.test.ts`:
- Zero network imports in `packages/core/finance/`
- Zero Gateway imports in `packages/core/finance/`
- Core uses only IPCClient for Plaid operations
- Transaction amounts stored as integers (cents), not floats
- Plaid tokens stored encrypted

### I2: Integration Tests

Create `tests/integration/finance-e2e.test.ts`:
- E2E: import CSV → categorize → spending breakdown → insights
- E2E: anomaly detection on imported transactions
- E2E: feature gate blocks spending insights for free tier

**Tests (5+):** privacy (3) + integration (2+)

---

## Commit Strategy

| Commit | Section | Description | Tests |
|--------|---------|-------------|-------|
| 1 | E2, G1 | IPC ActionTypes (6 Plaid) + ALL exhaustive record entries atomically | 4+ |
| 2 | A | TransactionStore + ImportPipeline | 10+ |
| 3 | B | Category taxonomy + LLM categorizer + categorization queue | 10+ |
| 4 | C | SpendingAnalyzer (insights + trends) | 10+ |
| 5 | D | AnomalyDetector + AnomalyStore | 8+ |
| 6 | E1 | PlaidAdapter (Gateway) | 6+ |
| 7 | F | PremiumGate + gate integration | 6+ |
| 8 | G2-G3 | Orchestrator tools + ProactiveEngine financial insights | 5+ |
| 9 | H | Financial Dashboard + Settings UI + AppState | 8+ |
| 10 | I | Privacy tests + integration tests + barrel exports | 5+ |

**Minimum 70 new tests. Target: 75+.**

---

## Exit Criteria

Step 19 is complete when ALL of the following are true.

### Transaction Store + Import (A)
1. ☐ TransactionStore stores transactions with amounts in cents (integer)
2. ☐ Import pipeline: CSV → normalize → deduplicate → store → queue for categorization
3. ☐ Import pipeline: OFX → same flow
4. ☐ Monthly spending aggregation queries work correctly

### LLM Categorization (B)
5. ☐ Category taxonomy defined with 11+ categories and subcategories
6. ☐ LLM categorizer: batch transactions → categories via local LLM
7. ☐ Fallback: rule-based categorization when LLM unavailable
8. ☐ Categorization queue processes in background

### Spending Insights (C)
9. ☐ Monthly spending breakdown by category
10. ☐ Month-over-month comparison with change percentages
11. ☐ Spending trends over N months
12. ☐ Natural language insights generated ("Dining up 40%")

### Anomaly Detection (D)
13. ☐ First-time merchant detection
14. ☐ Unusual amount detection (vs historical pattern)
15. ☐ Duplicate charge detection (same merchant + amount within 24h)
16. ☐ Anomaly dismissal works
17. ☐ Minimum data requirement enforced (30+ transactions)

### Plaid Integration (E)
18. ☐ 6 Plaid IPC ActionTypes with payload schemas + all exhaustive records
19. ☐ PlaidAdapter: Link flow → token exchange → encrypted storage
20. ☐ Transaction sync returns incremental results with cursor
21. ☐ Balance retrieval works
22. ☐ Disconnect revokes token and clears data

### Feature Gate (F)
23. ☐ PremiumGate checks license tier
24. ☐ Free tier: subscription detection available, spending insights blocked
25. ☐ Digital Representative tier: all financial features available
26. ☐ License activation with valid key works

### Autonomy + Integration (G)
27. ☐ Finance domain has all action types in exhaustive records
28. ☐ Orchestrator: query_spending, query_transactions, query_anomalies, query_subscriptions tools
29. ☐ ProactiveEngine: spending-alert, anomaly-alert, subscription-renewal insight types
30. ☐ FinancialInsightTracker wired into ProactiveEngine

### UI (H)
31. ☐ Financial Dashboard renders (free: subscriptions + Digital Representative prompt; Digital Representative: full)
32. ☐ Finance Settings with import + Plaid + configuration
33. ☐ AppState extended with financeSettings

### Privacy + Tests
34. ☐ Zero network imports in `packages/core/finance/`
35. ☐ Zero Gateway imports in `packages/core/finance/`
36. ☐ Transaction amounts stored as integers (cents)
37. ☐ `npx tsc --noEmit` → zero errors
38. ☐ All existing 3,086 tests pass — zero regressions
39. ☐ 70+ new tests from this step
40. ☐ Total test suite passes with zero failures

**All 40 criteria must be marked PASS.**

---

## Approved Dependencies

### New (Gateway-side ONLY, requires justification)
- `plaid-node` — Plaid SDK for bank connection (Gateway only, never in Core)
- Alternative: direct REST to Plaid API endpoints (same approach as Google Drive)

### NOT Approved
- Any financial SDK in Core
- Any cloud analytics or spending-tracking service
- Any dependency that transmits financial data externally
- Mint SDK, YNAB SDK, or any budgeting platform SDK

---

## Autonomous Decision Authority

You may proceed without escalating for:
- Category taxonomy content (adding/removing categories and subcategories)
- LLM batch size for categorization (10-25 range)
- Anomaly detection thresholds (amount deviation multiplier, spike threshold)
- Minimum transaction count for anomaly activation (20-50 range)
- Plaid rate limits (within reason)
- Chart implementation approach (SVG vs CSS)
- Transaction deduplication strategy details
- Plaid cursor management details
- Premium gate error message wording

## Escalation Triggers — STOP and Report

You MUST stop and report back to Orbital Directors if:
- Sprint 2 financial code cannot be located or has been deleted/overwritten
- Sprint 2 merchant normalizer interface is incompatible with the import pipeline
- `plaid-node` requires a Plaid API key at import time (not just at runtime) — blocks testing
- Premium gate pattern would require changes to more than 5 existing files
- LLM categorization prompt consistently fails to produce parseable JSON
- Any change would require network access in `packages/core/` (RULE 1 VIOLATION)
- Exhaustive record update causes type regressions in more than 3 files
- Existing subscription detection code has breaking interface changes vs what the audit described

---

## Verification Commands

```bash
echo "=== CHECK 1: GIT HISTORY ==="
git log --oneline -12
echo "--- Expected: 10 Step 19 commits visible ---"

echo "=== CHECK 2: TYPESCRIPT ==="
npx tsc --noEmit 2>&1
echo "EXIT_CODE=$?"
echo "--- Expected: EXIT_CODE=0, zero errors ---"

echo "=== CHECK 3: TEST SUITE ==="
npx vitest run 2>&1 | tail -30
echo "--- Expected: ~3,156+ tests, 0 failures ---"

echo "=== CHECK 4: TEST FILES EXIST ==="
for f in \
  tests/core/finance/transaction-store.test.ts \
  tests/core/finance/import-pipeline.test.ts \
  tests/core/finance/category-taxonomy.test.ts \
  tests/core/finance/llm-categorizer.test.ts \
  tests/core/finance/categorization-queue.test.ts \
  tests/core/finance/spending-analyzer.test.ts \
  tests/core/finance/anomaly-detector.test.ts \
  tests/core/finance/anomaly-store.test.ts \
  tests/core/finance/finance-autonomy.test.ts \
  tests/core/finance/orchestrator-finance.test.ts \
  tests/core/finance/financial-insight-tracker.test.ts \
  tests/core/finance/plaid-ipc.test.ts \
  tests/core/premium/premium-gate.test.ts \
  tests/gateway/plaid-adapter.test.ts \
  tests/desktop/financial-dashboard.test.ts \
  tests/desktop/finance-settings.test.ts \
  tests/privacy/finance-privacy.test.ts \
  tests/integration/finance-e2e.test.ts; do
  if [ -f "$f" ]; then echo "OK: $f"
  else echo "MISSING: $f"
  fi
done

echo "=== CHECK 5: SOURCE FILES EXIST ==="
for f in \
  packages/core/finance/transaction-store.ts \
  packages/core/finance/import-pipeline.ts \
  packages/core/finance/category-taxonomy.ts \
  packages/core/finance/llm-categorizer.ts \
  packages/core/finance/categorization-queue.ts \
  packages/core/finance/spending-analyzer.ts \
  packages/core/finance/anomaly-detector.ts \
  packages/core/finance/anomaly-store.ts \
  packages/core/finance/financial-insight-tracker.ts \
  packages/core/finance/index.ts \
  packages/core/premium/premium-gate.ts \
  packages/gateway/services/plaid-adapter.ts \
  packages/desktop/src/components/FinancialDashboard.tsx \
  packages/desktop/src/components/FinanceSettingsSection.tsx \
  packages/mobile/src/screens/FinancialDashboardScreen.tsx; do
  if [ -f "$f" ]; then echo "OK: $f ($(wc -l < "$f") lines)"
  else echo "MISSING: $f"
  fi
done

echo "=== CHECK 6: ZERO NETWORK IN CORE ==="
grep -rn "import.*from.*['\"]node:http\|import.*from.*['\"]node:https\|import.*from.*['\"]node:net" packages/core/finance/ packages/core/premium/ --include="*.ts" || echo "CLEAN"
grep -rn "import.*from.*['\"]node-fetch\|import.*from.*['\"]undici\|import.*from.*['\"]axios" packages/core/finance/ packages/core/premium/ --include="*.ts" || echo "CLEAN"

echo "=== CHECK 7: ZERO GATEWAY IMPORTS IN CORE ==="
grep -rn "from.*['\"].*gateway" packages/core/finance/ packages/core/premium/ --include="*.ts" | grep -v '\.test\.' || echo "CLEAN"

echo "=== CHECK 8: AMOUNTS IN CENTS ==="
echo "--- Transaction amounts should be integers (cents), not floats ---"
grep -n "amount.*number" packages/core/finance/transaction-store.ts | head -5
grep -n "Cents\|cents\|integer" packages/core/finance/transaction-store.ts | head -5
echo "--- Expected: amount fields documented as cents (integer) ---"

echo "=== CHECK 9: PREMIUM GATE ==="
grep -n "isPremium\|isFeatureAvailable\|LicenseTier" packages/core/premium/premium-gate.ts | head -10
echo "--- Expected: gate methods present ---"

echo "=== CHECK 10: PLAID TOKENS ENCRYPTED ==="
grep -n "encrypt\|credential" packages/gateway/services/plaid-adapter.ts | head -5
echo "--- Expected: tokens stored via encrypted credential store ---"

echo "=== CHECK 11: AUTONOMY + ORCHESTRATOR ==="
grep -n "finance\.\|plaid" packages/core/agent/autonomy.ts | head -15
grep -n "query_spending\|query_transactions\|query_anomalies\|query_subscriptions" packages/core/agent/orchestrator.ts | head -5
echo "--- Expected: finance domain complete, 4 query tools in orchestrator ---"

echo "=== CHECK 12: PROACTIVE ENGINE ==="
grep -n "spending-alert\|anomaly-alert\|subscription-renewal\|balance-low" packages/core/agent/proactive-engine.ts | head -5
grep -n "FinancialInsightTracker" packages/core/finance/ --include="*.ts" -r | head -3
echo "--- Expected: 4 insight types + tracker ---"

echo "=== CHECK 13: EXISTING PRIVACY TESTS ==="
npx vitest run tests/privacy/ 2>&1 | tail -10

echo "=== CHECK 14: STUB AUDIT ==="
grep -rn "TODO\|PLACEHOLDER\|FIXME\|stub\|not.implemented" packages/core/finance/ packages/core/premium/ packages/gateway/services/plaid-adapter.ts --include="*.ts" | grep -v '\.test\.' | grep -v 'node_modules'

echo "=== CHECK 15: PREMIUM GATE IN DASHBOARD ==="
grep -n "isPremium\|isFeatureAvailable\|upgrade\|premium" packages/desktop/src/components/FinancialDashboard.tsx | head -5
echo "--- Expected: gate check present in dashboard ---"

echo ""
echo "=========================================="
echo "  STEP 19 VERIFICATION SUMMARY"
echo "=========================================="
echo ""
echo "CHECK 1:  Git History (10 commits)             [ ]"
echo "CHECK 2:  TypeScript Clean (EXIT_CODE=0)        [ ]"
echo "CHECK 3:  Tests (≥3,156, 0 failures)            [ ]"
echo "CHECK 4:  Test Files Exist (18 files)           [ ]"
echo "CHECK 5:  Source Files Exist (15+ files)        [ ]"
echo "CHECK 6:  Zero Network in Core                  [ ]"
echo "CHECK 7:  Zero Gateway Imports in Core          [ ]"
echo "CHECK 8:  Amounts in Cents (Integer)            [ ]"
echo "CHECK 9:  Premium Gate Present                  [ ]"
echo "CHECK 10: Plaid Tokens Encrypted                [ ]"
echo "CHECK 11: Autonomy + Orchestrator Tools         [ ]"
echo "CHECK 12: ProactiveEngine Financial Insights    [ ]"
echo "CHECK 13: Existing Privacy Tests Pass           [ ]"
echo "CHECK 14: Stub Audit Clean                      [ ]"
echo "CHECK 15: Premium Gate in Dashboard             [ ]"
echo ""
echo "ALL 15 CHECKS MUST PASS."
echo "=========================================="
```

---

## The Bar

When this step closes:

- A user imports their bank CSV. Within seconds, every transaction is categorized by the local LLM: groceries, dining, subscriptions, transportation. They see a donut chart of their monthly spending and a trend line showing month-over-month patterns. "You spent 40% more on dining this month." All computed locally, all private.

- A new $847 charge from an unknown merchant appears. Semblance flags it immediately: "First-time merchant: ACME CORP. Amount $847.00. This merchant has never appeared in your transaction history." The user reviews it and dismisses it — or investigates further.

- A Digital Representative user connects Plaid. Their bank transactions sync automatically every day. No CSV downloads, no manual imports. Combined with email intelligence, Semblance knows about the charges AND the receipt emails — linking "Charge: $89.99 from Adobe" with "Your Creative Cloud subscription has renewed."

- A free-tier user opens the financial section. They see their detected subscriptions — "$47.97/month across 3 subscriptions" — with a clear prompt: "Activate your Digital Representative — Semblance works on your behalf to track your spending, flag unusual charges, and protect you from dark patterns." The subscription detection is the hook. The Digital Representative is the value.

- A privacy auditor checks: all transaction data in local SQLite, amounts stored as cents (no floating-point), Plaid tokens encrypted, LLM categorization runs entirely on-device. The user's financial data never leaves their machine. Not to categorize it. Not to analyze it. Not for anything.

Your money. Your device. Your intelligence.

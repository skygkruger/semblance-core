// Finance Adapter Interfaces — Public contracts for IP-separated finance modules.
// Implementation lives in @semblance/dr (private). These interfaces stay public.
// CRITICAL: This file is in packages/core/. No implementation logic. Types only.

import type { LLMProvider } from '../llm/types.js';
import type { DatabaseHandle } from '../platform/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CSVParseOptions {
  dateColumn?: string;
  amountColumn?: string;
  descriptionColumn?: string;
  dateFormat?: string;
  hasHeader?: boolean;
  delimiter?: string;
}

export interface ParsedTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  normalizedMerchant: string;
  category: string;
  isRecurring: boolean;
  recurrenceGroup: string | null;
}

export interface StatementImport {
  id: string;
  fileName: string;
  fileFormat: 'csv' | 'ofx' | 'qfx';
  transactionCount: number;
  dateRange: { start: string; end: string };
  importedAt: string;
}

export interface RecurringCharge {
  id: string;
  merchantName: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  confidence: number;
  lastChargeDate: string;
  chargeCount: number;
  estimatedAnnualCost: number;
  transactions: ParsedTransaction[];
  status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
}

export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

export interface CategoryDefinition {
  name: string;
  subcategories: string[];
  keywords: string[];
}

// ─── Adapter Interfaces ─────────────────────────────────────────────────────

export interface IStatementParser {
  parseStatement(filePath: string): Promise<{ transactions: ParsedTransaction[]; import: StatementImport }>;
  parseCSV(content: string, options?: CSVParseOptions): Promise<ParsedTransaction[]>;
  parseOFX(content: string): ParsedTransaction[];
  llmColumnMapping(sampleRows: string[][]): Promise<{ dateIndex: number; amountIndex: number; descriptionIndex: number } | null>;
}

export interface IMerchantNormalizer {
  normalize(description: string): { name: string; category: string };
  normalizeAll(transactions: ParsedTransaction[]): ParsedTransaction[];
  groupByMerchant(transactions: ParsedTransaction[]): Map<string, ParsedTransaction[]>;
  addCorrection(rawDescription: string, correctedName: string): void;
  llmNormalize(descriptions: string[]): Promise<Map<string, string>>;
}

export interface IRecurringDetector {
  detect(transactions: ParsedTransaction[]): RecurringCharge[];
  flagForgotten(
    charges: RecurringCharge[],
    emailSearchFn: (merchant: string) => Array<{ receivedAt: string }>,
    daysSinceEmail?: number,
  ): Promise<RecurringCharge[]>;
  storeImport(importRecord: StatementImport, transactions: ParsedTransaction[]): void;
  storeCharges(charges: RecurringCharge[]): void;
  getStoredCharges(status?: string): RecurringCharge[];
  updateStatus(chargeId: string, status: RecurringCharge['status']): void;
  getSummary(): SubscriptionSummary;
  getImports(): StatementImport[];
}

// Subscription Adapter — Displays detected subscriptions and annual cost on mobile.
// CSV/OFX import stays desktop-only. Mobile views synced subscription data.

import { getRuntimeState } from '../runtime/mobile-runtime.js';

export interface SubscriptionItem {
  id: string;
  merchant: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  annualCost: number;
  confidence: number;
  isForgotten: boolean;
  lastCharged?: string;
}

export interface SubscriptionSummaryView {
  totalSubscriptions: number;
  totalAnnualCost: number;
  forgottenCount: number;
  forgottenAnnualCost: number;
  subscriptions: SubscriptionItem[];
}

/**
 * Convert Core's RecurringCharge[] to mobile SubscriptionItem[].
 */
export function chargesToSubscriptionItems(
  charges: Array<{
    id: string;
    merchant: string;
    amount: number;
    frequency: string;
    confidence: number;
    isForgotten: boolean;
    lastDate?: string;
  }>
): SubscriptionItem[] {
  return charges.map(charge => ({
    id: charge.id,
    merchant: charge.merchant,
    amount: charge.amount,
    frequency: charge.frequency as SubscriptionItem['frequency'],
    annualCost: calculateAnnualCost(charge.amount, charge.frequency),
    confidence: charge.confidence,
    isForgotten: charge.isForgotten,
    lastCharged: charge.lastDate,
  }));
}

/**
 * Build a subscription summary view.
 */
export function buildSubscriptionSummary(items: SubscriptionItem[]): SubscriptionSummaryView {
  const forgotten = items.filter(i => i.isForgotten);
  return {
    totalSubscriptions: items.length,
    totalAnnualCost: items.reduce((sum, i) => sum + i.annualCost, 0),
    forgottenCount: forgotten.length,
    forgottenAnnualCost: forgotten.reduce((sum, i) => sum + i.annualCost, 0),
    subscriptions: items,
  };
}

function calculateAnnualCost(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly': return amount * 52;
    case 'monthly': return amount * 12;
    case 'quarterly': return amount * 4;
    case 'annual': return amount;
    default: return amount * 12;
  }
}

// ─── Core Integration ─────────────────────────────────────────────────────────

/**
 * Load subscriptions from the knowledge graph by searching for financial documents
 * that contain recurring charge patterns.
 *
 * CSV/OFX import is desktop-only. On mobile, subscription data comes from:
 * 1. Financial documents indexed via the knowledge graph (synced from desktop)
 * 2. Direct financial document search for recurring patterns
 *
 * Returns empty summary (not fake data) when no financial data is indexed.
 */
export async function loadSubscriptions(): Promise<SubscriptionSummaryView> {
  const { core } = getRuntimeState();

  if (!core) {
    return buildSubscriptionSummary([]);
  }

  try {
    // Search the knowledge graph for financial documents containing subscription info
    const results = await core.knowledge.search(
      'recurring subscription charge monthly payment',
      { limit: 50, source: 'financial' },
    );

    if (results.length === 0) {
      return buildSubscriptionSummary([]);
    }

    // Extract subscription data from financial document metadata
    const charges: Array<{
      id: string;
      merchant: string;
      amount: number;
      frequency: string;
      confidence: number;
      isForgotten: boolean;
      lastDate?: string;
    }> = [];

    for (const result of results) {
      const meta = result.document.metadata;
      // Financial documents with subscription metadata have these fields populated
      // by the RecurringDetector during desktop indexing
      if (meta?.merchant && typeof meta.amount === 'number') {
        charges.push({
          id: result.document.id,
          merchant: meta.merchant as string,
          amount: meta.amount as number,
          frequency: (meta.frequency as string) ?? 'monthly',
          confidence: (meta.confidence as number) ?? 0.5,
          isForgotten: (meta.isForgotten as boolean) ?? false,
          lastDate: meta.lastDate as string | undefined,
        });
      }
    }

    const items = chargesToSubscriptionItems(charges);
    return buildSubscriptionSummary(items);
  } catch (err) {
    console.error('[SubscriptionAdapter] Failed to load subscriptions:', err);
    return buildSubscriptionSummary([]);
  }
}

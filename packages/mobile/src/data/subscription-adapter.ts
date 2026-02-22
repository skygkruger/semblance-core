// Subscription Adapter — Displays detected subscriptions and annual cost on mobile.
// CSV/OFX import stays desktop-only. Mobile views synced subscription data.

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

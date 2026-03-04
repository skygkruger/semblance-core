// FinancialDashboard types — pure presentation, all data passed in as props.

export interface FinancialOverview {
  totalSpending: number;
  previousPeriodSpending: number | null;
  transactionCount: number;
  periodStart: string;
  periodEnd: string;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  percentage: number;
  transactionCount: number;
  trend: 'up' | 'down' | 'stable';
}

export interface SpendingAnomaly {
  id: string;
  type: 'unusual_amount' | 'new_merchant' | 'frequency_change' | 'duplicate';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  amount: number;
  merchantName: string;
  detectedAt: string;
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
  status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
}

export interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

export type FinancialPeriod = '7d' | '30d' | '90d' | 'custom';

export interface FinancialDashboardProps {
  overview: FinancialOverview | null;
  categories: CategoryBreakdown[];
  anomalies: SpendingAnomaly[];
  subscriptions: { charges: RecurringCharge[]; summary: SubscriptionSummary };
  selectedPeriod: FinancialPeriod;
  onPeriodChange: (p: FinancialPeriod) => void;
  onDismissAnomaly: (id: string) => void;
  onCancelSubscription: (chargeId: string) => void;
  onKeepSubscription: (chargeId: string) => void;
  onImportStatement: () => void;
  loading?: boolean;
}

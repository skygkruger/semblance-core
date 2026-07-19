export interface CloudBudgetPanelLimits {
  perTaskEstimateCents: number;
  dailyHardLimitCents: number;
  monthlyHardLimitCents: number;
  alertThresholdPercent: number;
  cloudDisabled: boolean;
}

export interface CloudBudgetPanelSummary {
  dailySpentCents: number;
  monthlySpentCents: number;
  alerts: readonly string[];
}

export interface CloudBudgetPanelProps {
  limits: CloudBudgetPanelLimits;
  summary: CloudBudgetPanelSummary;
  onLimitsChange: (updates: Partial<CloudBudgetPanelLimits>) => void;
  onCloudDisableChange: (disabled: boolean) => void;
}

export function formatBudgetCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function budgetUsagePercent(spent: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((spent / limit) * 100));
}

// FinancialDashboardScreen — Mobile financial tracking wrapper.
//
// Wraps the shared FinancialDashboard component from @semblance/ui.
// Manages IPC data loading and premium gating.

import { useState, useEffect, useCallback } from 'react';
import { FinancialDashboard } from '@semblance/ui/components/FinancialDashboard/FinancialDashboard.native';
import type {
  FinancialOverview,
  CategoryBreakdown,
  SpendingAnomaly,
  RecurringCharge,
  SubscriptionSummary,
  FinancialPeriod,
} from '@semblance/ui/components/FinancialDashboard/FinancialDashboard.types';

interface FinancialDashboardScreenProps {
  isPremium: boolean;
  onActivateDigitalRepresentative: () => void;
}

export function FinancialDashboardScreen({
  isPremium,
  onActivateDigitalRepresentative,
}: FinancialDashboardScreenProps) {
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialPeriod>('30d');
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [categories, setCategories] = useState<CategoryBreakdown[]>([]);
  const [anomalies, setAnomalies] = useState<SpendingAnomaly[]>([]);
  const [subscriptions, setSubscriptions] = useState<{
    charges: RecurringCharge[];
    summary: SubscriptionSummary;
  }>({
    charges: [],
    summary: {
      totalMonthly: 0,
      totalAnnual: 0,
      activeCount: 0,
      forgottenCount: 0,
      potentialSavings: 0,
    },
  });

  useEffect(() => {
    // TODO: Sprint 5 — wire to actual sidecar financial data commands
    setLoading(false);
  }, [selectedPeriod]);

  const handleDismissAnomaly = useCallback((_id: string) => {
    // TODO: Sprint 5 — wire to actual sidecar dismiss command
    setAnomalies((prev) => prev.filter((a) => a.id !== _id));
  }, []);

  const handleCancelSubscription = useCallback((_chargeId: string) => {
    // TODO: Sprint 5 — wire to DR subscription cancellation workflow
  }, []);

  const handleKeepSubscription = useCallback((_chargeId: string) => {
    // TODO: Sprint 5 — wire to sidecar subscription status update
    setSubscriptions((prev) => ({
      ...prev,
      charges: prev.charges.map((c) =>
        c.id === _chargeId ? { ...c, status: 'user_confirmed' as const } : c,
      ),
    }));
  }, []);

  const handleImportStatement = useCallback(() => {
    // TODO: Sprint 5 — wire to file picker + sidecar import command
  }, []);

  if (!isPremium) {
    // Handled by the navigation-level FeatureGate — this shouldn't render
    return null;
  }

  return (
    <FinancialDashboard
      overview={overview}
      categories={categories}
      anomalies={anomalies}
      subscriptions={subscriptions}
      selectedPeriod={selectedPeriod}
      onPeriodChange={setSelectedPeriod}
      onDismissAnomaly={handleDismissAnomaly}
      onCancelSubscription={handleCancelSubscription}
      onKeepSubscription={handleKeepSubscription}
      onImportStatement={handleImportStatement}
      loading={loading}
    />
  );
}

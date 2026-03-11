// FinancialDashboardScreen — Mobile financial tracking wrapper.
//
// Wraps the shared FinancialDashboard component from @semblance/ui.
// Manages IPC data loading and premium gating.

import { useState, useEffect, useCallback } from 'react';
import { getRuntimeState } from '../runtime/mobile-runtime.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
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

  const { ready, searchKnowledge } = useSemblance();

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadFinancialData = async () => {
      const state = getRuntimeState();
      if (state.core) {
        try {
          // Search for subscription and recurring charge data in the knowledge graph
          const subResults = await searchKnowledge('subscription recurring charge payment', 20);
          if (!cancelled && subResults.length > 0) {
            const charges: RecurringCharge[] = subResults
              .filter((r) => r.score > 0.3)
              .map((r, i) => ({
                id: `charge-${i}`,
                merchant: r.content.slice(0, 40).trim(),
                amount: 0,
                frequency: 'monthly' as const,
                category: 'subscription',
                lastCharged: new Date().toISOString(),
                status: 'active' as const,
                confidenceScore: r.score,
              }));
            setSubscriptions({
              charges,
              summary: {
                totalMonthly: 0,
                totalAnnual: 0,
                activeCount: charges.length,
                forgottenCount: 0,
                potentialSavings: 0,
              },
            });
          }

          // Search for spending anomaly data
          const anomalyResults = await searchKnowledge('unusual spending anomaly transaction', 10);
          if (!cancelled && anomalyResults.length > 0) {
            const parsedAnomalies: SpendingAnomaly[] = anomalyResults
              .filter((r) => r.score > 0.4)
              .map((r, i) => ({
                id: `anomaly-${i}`,
                merchant: r.content.slice(0, 40).trim(),
                amount: 0,
                typicalAmount: 0,
                category: 'spending',
                date: new Date().toISOString(),
                description: r.content.slice(0, 120),
              }));
            setAnomalies(parsedAnomalies);
          }
        } catch {
          // Knowledge graph unavailable
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadFinancialData();
    return () => { cancelled = true; };
  }, [selectedPeriod, ready, searchKnowledge]);

  const handleDismissAnomaly = useCallback((_id: string) => {
    // Removes from local state; requires sidecar dismiss command for persistence
    setAnomalies((prev) => prev.filter((a) => a.id !== _id));
  }, []);

  const handleCancelSubscription = useCallback((_chargeId: string) => {
    // Requires Digital Representative subscription cancellation workflow via unified-bridge
    console.warn('[FinancialDashboard] Subscription cancellation requires DR workflow integration');
  }, []);

  const handleKeepSubscription = useCallback((_chargeId: string) => {
    // Updates local state; requires sidecar subscription status update for persistence
    setSubscriptions((prev) => ({
      ...prev,
      charges: prev.charges.map((c) =>
        c.id === _chargeId ? { ...c, status: 'user_confirmed' as const } : c,
      ),
    }));
  }, []);

  const handleImportStatement = useCallback(() => {
    // Requires file picker + sidecar import command via unified-bridge
    console.warn('[FinancialDashboard] Statement import requires file picker and sidecar integration');
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

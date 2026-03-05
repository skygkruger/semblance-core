import { useState, useEffect, useCallback } from 'react';
import { FinancialDashboard, FeatureGate } from '@semblance/ui';
import type { FinancialPeriod } from '@semblance/ui/components/FinancialDashboard/FinancialDashboard.types';
import { useLicense } from '../contexts/LicenseContext';
import { useFeatureAuth } from '@semblance/ui';
import {
  getFinancialDashboard,
  dismissAnomaly as dismissAnomalyCmd,
  updateSubscriptionStatus,
  importStatement,
} from '../ipc/commands';
import type { FinancialDashboardData } from '../ipc/types';

export function FinancialDashboardScreen() {
  const license = useLicense();
  const { requireAuth } = useFeatureAuth();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FinancialDashboardData | null>(null);
  const [period, setPeriod] = useState<FinancialPeriod>('30d');

  // Per-screen biometric auth on first open
  useEffect(() => {
    let cancelled = false;
    requireAuth('financial_screen').then((result) => {
      if (!cancelled && result.success) {
        setAuthed(true);
      }
    });
    return () => { cancelled = true; };
  }, [requireAuth]);

  // Load data when authed
  useEffect(() => {
    if (!authed || !license.isPremium) return;
    setLoading(true);
    getFinancialDashboard(period)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [authed, period, license.isPremium]);

  const handleDismissAnomaly = useCallback(async (anomalyId: string) => {
    try {
      await dismissAnomalyCmd(anomalyId);
      setData((prev) =>
        prev ? { ...prev, anomalies: prev.anomalies.filter((a) => a.id !== anomalyId) } : prev,
      );
    } catch {
      // Sidecar not wired
    }
  }, []);

  const handleCancelSubscription = useCallback(async (chargeId: string) => {
    try {
      await updateSubscriptionStatus(chargeId, 'cancelled');
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subscriptions: {
            ...prev.subscriptions,
            charges: prev.subscriptions.charges.filter((c) => c.id !== chargeId),
          },
        };
      });
    } catch {
      // Sidecar not wired
    }
  }, []);

  const handleKeepSubscription = useCallback(async (chargeId: string) => {
    try {
      await updateSubscriptionStatus(chargeId, 'user_confirmed');
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subscriptions: {
            ...prev.subscriptions,
            charges: prev.subscriptions.charges.map((c) =>
              c.id === chargeId ? { ...c, status: 'user_confirmed' as const } : c,
            ),
          },
        };
      });
    } catch {
      // Sidecar not wired
    }
  }, []);

  const handleImportStatement = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const filePath = await invoke<string | null>('document_pick_file');
      if (filePath) {
        await importStatement(filePath);
        // Reload data after import
        const updated = await getFinancialDashboard(period);
        setData(updated);
      }
    } catch {
      // File dialog cancelled or import failed
    }
  }, [period]);

  if (!authed) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontFamily: 'var(--fb)',
        color: '#8593A4',
      }}>
        Authenticating...
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <FeatureGate
        feature="financial-dashboard"
        isPremium={license.isPremium}
        onLearnMore={() => license.openCheckout('monthly')}
      >
        <FinancialDashboard
          overview={data?.overview ?? null}
          categories={data?.categories ?? []}
          anomalies={data?.anomalies ?? []}
          subscriptions={data?.subscriptions ?? { charges: [], summary: { totalMonthly: 0, totalAnnual: 0, activeCount: 0, forgottenCount: 0, potentialSavings: 0 } }}
          selectedPeriod={period}
          onPeriodChange={setPeriod}
          onDismissAnomaly={handleDismissAnomaly}
          onCancelSubscription={handleCancelSubscription}
          onKeepSubscription={handleKeepSubscription}
          onImportStatement={handleImportStatement}
          loading={loading}
        />
      </FeatureGate>
    </div>
  );
}

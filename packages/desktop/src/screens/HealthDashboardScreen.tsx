import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { HealthDashboard, FeatureGate } from '@semblance/ui';
import { useLicense } from '../contexts/LicenseContext';
import { useFeatureAuth } from '@semblance/ui';
import {
  getHealthDashboard,
  saveHealthEntry as saveHealthEntryCmd,
} from '../ipc/commands';
import type { HealthDashboardData, HealthEntry } from '../ipc/types';

export function HealthDashboardScreen() {
  const navigate = useNavigate();
  const license = useLicense();
  const { requireAuth } = useFeatureAuth();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HealthDashboardData | null>(null);

  // Per-screen biometric auth on first open
  useEffect(() => {
    let cancelled = false;
    requireAuth('health_screen').then((result) => {
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
    getHealthDashboard(30)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [authed, license.isPremium]);

  const handleSaveEntry = useCallback(async (entry: Partial<HealthEntry> & { date: string }) => {
    try {
      const saved = await saveHealthEntryCmd(entry);
      setData((prev) =>
        prev ? { ...prev, todayEntry: saved } : prev,
      );
    } catch (err) {
      console.error('[HealthDashboard] saveEntry failed:', err);
    }
  }, []);

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

  if (!license.isPremium) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
      }}>
        <FeatureGate
          feature="health-tracking"
          isPremium={false}
          onLearnMore={() => navigate('/upgrade')}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
        <HealthDashboard
          todayEntry={data?.todayEntry ?? null}
          trends={data?.trends ?? []}
          insights={data?.insights ?? []}
          symptomsHistory={data?.symptomsHistory ?? []}
          medicationsHistory={data?.medicationsHistory ?? []}
          hasHealthKit={false}
          onSaveEntry={handleSaveEntry}
          loading={loading}
        />
      </div>
    </div>
  );
}

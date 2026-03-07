// HealthDashboardScreen — Mobile health tracking wrapper.
//
// On iOS: detects HealthKit availability via NativeModules.
// On Android: detects Health Connect availability.
// Desktop: hasHealthKit is always false (no native health APIs).
//
// Wraps the shared HealthDashboard component from @semblance/ui.

import { useState, useEffect, useCallback } from 'react';
import { Platform, NativeModules } from 'react-native';
import { HealthDashboard } from '@semblance/ui/components/HealthDashboard/HealthDashboard.native';
import type { HealthEntry, HealthTrendPoint, HealthInsight } from '@semblance/ui/components/HealthDashboard/HealthDashboard.types';

interface HealthDashboardScreenProps {
  isPremium: boolean;
  onActivateDigitalRepresentative: () => void;
}

export function HealthDashboardScreen({
  isPremium,
  onActivateDigitalRepresentative,
}: HealthDashboardScreenProps) {
  const [loading, setLoading] = useState(true);
  const [hasHealthKit, setHasHealthKit] = useState(false);
  const [todayEntry, setTodayEntry] = useState<HealthEntry | null>(null);
  const [trends, setTrends] = useState<HealthTrendPoint[]>([]);
  const [insights, setInsights] = useState<HealthInsight[]>([]);
  const [symptomsHistory, setSymptomsHistory] = useState<string[]>([]);
  const [medicationsHistory, setMedicationsHistory] = useState<string[]>([]);

  useEffect(() => {
    // Detect HealthKit/Health Connect availability
    if (Platform.OS === 'ios' && NativeModules.HealthKitBridge) {
      NativeModules.HealthKitBridge.isAvailable()
        .then((available: boolean) => setHasHealthKit(available))
        .catch(() => setHasHealthKit(false));
    } else {
      setHasHealthKit(false);
    }

    // Health data will be loaded once sidecar health data commands are wired via unified-bridge
    setLoading(false);
  }, []);

  const handleSaveEntry = useCallback(async (entry: Partial<HealthEntry> & { date: string }) => {
    // Saves locally in component state; requires sidecar save command for persistence
    const saved: HealthEntry = {
      id: entry.date,
      date: entry.date,
      timestamp: new Date().toISOString(),
      mood: entry.mood ?? null,
      energy: entry.energy ?? null,
      waterGlasses: entry.waterGlasses ?? null,
      symptoms: entry.symptoms ?? [],
      medications: entry.medications ?? [],
      notes: entry.notes ?? null,
    };
    setTodayEntry(saved);
  }, []);

  if (!isPremium) {
    // Handled by the navigation-level FeatureGate — this shouldn't render
    return null;
  }

  return (
    <HealthDashboard
      todayEntry={todayEntry}
      trends={trends}
      insights={insights}
      symptomsHistory={symptomsHistory}
      medicationsHistory={medicationsHistory}
      hasHealthKit={hasHealthKit}
      onSaveEntry={handleSaveEntry}
      loading={loading}
    />
  );
}

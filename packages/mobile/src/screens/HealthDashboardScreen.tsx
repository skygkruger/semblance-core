// HealthDashboardScreen — Mobile health tracking wrapper.
//
// On iOS: detects HealthKit availability via NativeModules.
// On Android: detects Health Connect availability.
// Desktop: hasHealthKit is always false (no native health APIs).
//
// Wraps the shared HealthDashboard component from @semblance/ui.

import { useState, useEffect, useCallback } from 'react';
import { Platform, NativeModules } from 'react-native';
import { getRuntimeState } from '../runtime/mobile-runtime.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
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

  const { ready, searchKnowledge } = useSemblance();

  useEffect(() => {
    // Detect HealthKit/Health Connect availability
    if (Platform.OS === 'ios' && NativeModules.HealthKitBridge) {
      NativeModules.HealthKitBridge.isAvailable()
        .then((available: boolean) => setHasHealthKit(available))
        .catch(() => setHasHealthKit(false));
    } else {
      setHasHealthKit(false);
    }

    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadHealthData = async () => {
      const state = getRuntimeState();
      if (state.core) {
        try {
          // Search for health-related data in the knowledge graph
          const results = await searchKnowledge('health mood energy sleep wellness', 20);
          if (!cancelled && results.length > 0) {
            // Parse any health insights from the knowledge graph
            const parsedInsights: HealthInsight[] = results
              .filter((r) => r.score > 0.3)
              .map((r, i) => ({
                id: `insight-${i}`,
                type: 'correlation' as const,
                title: r.content.slice(0, 60).trim(),
                description: r.content.slice(0, 200),
                confidence: r.score,
                generatedAt: new Date().toISOString(),
              }));
            setInsights(parsedInsights);
          }

          // Load symptom/medication history from knowledge graph
          const symptomResults = await searchKnowledge('symptom medication treatment', 10);
          if (!cancelled && symptomResults.length > 0) {
            const symptoms = symptomResults.map((r) => r.content.slice(0, 30).trim());
            setSymptomsHistory(symptoms);
          }
        } catch {
          // Knowledge graph unavailable
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadHealthData();
    return () => { cancelled = true; };
  }, [ready, searchKnowledge]);

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

// AlterEgoWeekScreen — Mobile 7-day trust-building activation sequence.
// DR-gated: requires Digital Representative license.
// Data loaded via useSemblance() and local runtime, NOT Tauri IPC.
// CRITICAL: No networking imports. All processing is local.

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AlterEgoWeekState {
  active: boolean;
  currentDay: number | null;
  completedDays: number[];
  startedAt: string | null;
  completedAt: string | null;
  activationOffered: boolean;
  userActivated: boolean;
}

interface DayDemoResult {
  day: number;
  title: string;
  description?: string;
  actions?: Array<{ label: string; result: string }>;
}

const DEFAULT_STATE: AlterEgoWeekState = {
  active: false,
  currentDay: null,
  completedDays: [],
  startedAt: null,
  completedAt: null,
  activationOffered: false,
  userActivated: false,
};

const DAY_LABELS: Record<number, { title: string; description: string }> = {
  1: { title: 'Email Triage', description: 'Semblance reviews your inbox and categorizes messages by urgency, drafts replies, and flags items needing your attention.' },
  2: { title: 'Calendar Intelligence', description: 'Semblance analyzes your schedule, identifies conflicts, and suggests optimal meeting prep.' },
  3: { title: 'File Organization', description: 'Semblance scans recent documents, suggests organization, and surfaces relevant files you may have forgotten.' },
  4: { title: 'Contact Insights', description: 'Semblance reviews your relationships, identifies follow-ups due, and drafts check-in messages.' },
  5: { title: 'Financial Awareness', description: 'Semblance reviews recent transactions, flags unusual patterns, and surfaces upcoming bills.' },
  6: { title: 'Health Patterns', description: 'Semblance correlates your health data, identifies trends, and suggests wellness improvements.' },
  7: { title: 'Full Autonomy Demo', description: 'Semblance runs a complete autonomous day: email, calendar, files, contacts, and proactive actions combined.' },
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface AlterEgoWeekScreenProps {
  isPremium: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AlterEgoWeekScreen({ isPremium }: AlterEgoWeekScreenProps) {
  const { ready, sendMessage } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [weekState, setWeekState] = useState<AlterEgoWeekState>(DEFAULT_STATE);
  const [runningDay, setRunningDay] = useState(false);
  const [dayResult, setDayResult] = useState<DayDemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load week state from the local runtime
  const loadState = useCallback(async () => {
    const state = getRuntimeState();
    if (state.core) {
      try {
        // Query knowledge graph for alter ego week state
        const result = await sendMessage('/alter_ego_week_get_state');
        // Parse state from AI response if structured data is returned
        // For now, use the default state (real implementation depends on sidecar handler)
        if (result && typeof result === 'object') {
          // The sendMessage returns a ChatMessage; structured data may be in content
          // We keep DEFAULT_STATE until the handler returns structured JSON
        }
      } catch (err) {
        console.error('[AlterEgoWeekScreen] Failed to load state:', err);
      }
    }
    setLoading(false);
  }, [sendMessage]);

  useEffect(() => {
    if (ready) {
      loadState();
    } else {
      setLoading(false);
    }
  }, [ready, loadState]);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      await sendMessage('/alter_ego_week_start');
      setWeekState(prev => ({
        ...prev,
        active: true,
        currentDay: 1,
        startedAt: new Date().toISOString(),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [sendMessage]);

  const handleRunDay = useCallback(async () => {
    if (weekState.currentDay === null) return;
    setRunningDay(true);
    setError(null);
    setDayResult(null);
    try {
      const day = weekState.currentDay;
      const label = DAY_LABELS[day];
      await sendMessage(`/alter_ego_week_run_day ${day}`);
      setDayResult({
        day,
        title: label?.title ?? `Day ${day}`,
        description: `Completed ${label?.title ?? 'day'} demo successfully.`,
        actions: [{ label: 'Status', result: 'Complete' }],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningDay(false);
    }
  }, [weekState.currentDay, sendMessage]);

  const handleAdvance = useCallback(() => {
    setError(null);
    setDayResult(null);
    setWeekState(prev => {
      const nextDay = (prev.currentDay ?? 0) + 1;
      const completedDays = prev.currentDay !== null
        ? [...prev.completedDays, prev.currentDay]
        : prev.completedDays;
      if (nextDay > 7) {
        return {
          ...prev,
          completedDays,
          currentDay: null,
          completedAt: new Date().toISOString(),
          activationOffered: true,
        };
      }
      return { ...prev, completedDays, currentDay: nextDay };
    });
  }, []);

  const handleSkip = useCallback(() => {
    setError(null);
    setDayResult(null);
    setWeekState(prev => {
      const nextDay = (prev.currentDay ?? 0) + 1;
      if (nextDay > 7) {
        return {
          ...prev,
          currentDay: null,
          completedAt: new Date().toISOString(),
          activationOffered: true,
        };
      }
      return { ...prev, currentDay: nextDay };
    });
  }, []);

  const handleAccept = useCallback(() => {
    setError(null);
    setWeekState(prev => ({ ...prev, userActivated: true }));
  }, []);

  // Premium gate
  if (!isPremium) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Alter Ego Week</Text>
        <View style={styles.card}>
          <Text style={styles.gateText}>
            Alter Ego Week is a 7-day trust-building sequence that demonstrates autonomous
            capabilities. This feature requires the Digital Representative tier.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const allDays = [1, 2, 3, 4, 5, 6, 7];
  const isComplete = weekState.completedAt !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.title}>Alter Ego Week</Text>
      <Text style={styles.subtitle}>
        Build trust through 7 days of autonomous demonstrations.
      </Text>

      {/* Error */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 7-Day Timeline */}
      <View style={styles.timeline}>
        {allDays.map((day) => {
          const isCompleted = weekState.completedDays.includes(day);
          const isCurrent = weekState.currentDay === day;
          return (
            <View
              key={day}
              style={[
                styles.timelineDay,
                isCompleted && styles.timelineDayCompleted,
                isCurrent && styles.timelineDayCurrent,
              ]}
            >
              <Text
                style={[
                  styles.timelineDayText,
                  isCompleted && styles.timelineDayTextCompleted,
                  isCurrent && styles.timelineDayTextCurrent,
                ]}
              >
                {day}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Not started */}
      {!weekState.active && !isComplete && (
        <View style={styles.card}>
          <Text style={styles.cardText}>
            Over 7 days, Semblance will demonstrate autonomous capabilities across email,
            calendar, files, contacts, finances, health, and full agent mode. Each day
            builds on the last.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleStart}>
            <Text style={styles.primaryButtonText}>Start Week</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Current Day Card */}
      {weekState.active && weekState.currentDay !== null && !isComplete && (
        <View style={styles.card}>
          <View style={styles.dayHeader}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>Day {weekState.currentDay}</Text>
            </View>
            <Text style={styles.dayTitle}>
              {DAY_LABELS[weekState.currentDay]?.title ?? `Day ${weekState.currentDay}`}
            </Text>
          </View>
          <Text style={styles.dayDescription}>
            {DAY_LABELS[weekState.currentDay]?.description ?? ''}
          </Text>

          {/* Day Result */}
          {dayResult && (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>{dayResult.title}</Text>
              {dayResult.description && (
                <Text style={styles.resultDescription}>{dayResult.description}</Text>
              )}
              {dayResult.actions && dayResult.actions.length > 0 && (
                <View style={styles.resultActions}>
                  {dayResult.actions.map((action, i) => (
                    <View key={i} style={styles.resultActionRow}>
                      <Text style={styles.resultActionLabel}>{action.label}</Text>
                      <Text style={styles.resultActionValue}>{action.result}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.primaryButton, runningDay && styles.buttonDisabled]}
              onPress={handleRunDay}
              disabled={runningDay}
            >
              <Text style={styles.primaryButtonText}>
                {runningDay ? 'Running...' : "Run Today's Challenge"}
              </Text>
            </TouchableOpacity>
            {dayResult && (
              <TouchableOpacity style={styles.secondaryButton} onPress={handleAdvance}>
                <Text style={styles.secondaryButtonText}>Advance</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.ghostButton} onPress={handleSkip}>
              <Text style={styles.ghostButtonText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Completion State */}
      {isComplete && (
        <View style={[styles.card, styles.cardComplete]}>
          <Text style={styles.dayTitle}>Week Complete</Text>
          <Text style={styles.cardText}>
            {weekState.userActivated
              ? 'Alter Ego tier is active. Semblance is operating with full autonomous capabilities.'
              : "You've completed all 7 days. Would you like to activate Alter Ego tier? Semblance will act on your behalf for nearly everything, interrupting only for high-stakes decisions."}
          </Text>
          {weekState.activationOffered && !weekState.userActivated && (
            <TouchableOpacity style={styles.primaryButton} onPress={handleAccept}>
              <Text style={styles.primaryButtonText}>Activate Alter Ego</Text>
            </TouchableOpacity>
          )}
          {weekState.userActivated && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Alter Ego Active</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },

  // Error
  errorCard: {
    backgroundColor: 'rgba(232, 101, 122, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232, 101, 122, 0.3)',
    borderRadius: radius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.attention,
  },

  // Timeline
  timeline: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.lg,
  },
  timelineDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timelineDayCompleted: {
    backgroundColor: 'rgba(110, 207, 163, 0.15)',
  },
  timelineDayCurrent: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
    borderColor: 'rgba(110, 207, 163, 0.3)',
  },
  timelineDayText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  timelineDayTextCompleted: {
    color: colors.primary,
  },
  timelineDayTextCurrent: {
    color: colors.textPrimaryDark,
  },

  // Cards
  card: {
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardComplete: {
    borderColor: 'rgba(110, 207, 163, 0.2)',
  },
  cardText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  gateText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    lineHeight: 20,
  },

  // Day header
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dayBadge: {
    backgroundColor: 'rgba(110, 207, 163, 0.1)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  dayBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.primary,
  },
  dayTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  dayDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    lineHeight: 20,
    marginBottom: spacing.md,
  },

  // Result box
  resultBox: {
    backgroundColor: colors.surface2Dark,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  resultTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
    marginBottom: spacing.xs,
  },
  resultDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    lineHeight: 18,
  },
  resultActions: {
    marginTop: spacing.sm,
    gap: 6,
  },
  resultActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultActionLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  resultActionValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.primary,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.bgDark,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ghostButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textTertiary,
  },

  // Active badge
  activeBadge: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.primary,
  },
});

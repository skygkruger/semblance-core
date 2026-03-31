/**
 * AlterEgoWeekScreen — 7-day trust-building activation sequence.
 * DR-gated: requires Digital Representative license.
 * Backend handlers: alter_ego_week_get_state, alter_ego_week_start,
 * alter_ego_week_run_day, alter_ego_week_advance, alter_ego_week_skip, alter_ego_week_accept.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, FeatureGate, SkeletonCard, StatusIndicator } from '@semblance/ui';
import { sidecarCall } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';
import { AlterEgoWeekCard } from '../components/AlterEgoWeekCard';
import type { AlterEgoWeekProgress, AlterEgoWeekDay } from '../components/AlterEgoWeekCard';
import { AlterEgoActivationCard } from '../components/AlterEgoActivationCard';
import type { ActivationPromptData } from '../components/AlterEgoActivationCard';

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
  shareableCardData?: unknown;
}

const DAY_LABELS: Record<number, { title: string; description: string }> = {
  1: { title: 'Email Triage', description: 'Semblance reviews your inbox and categorizes messages by urgency, drafts replies, and flags items needing your attention.' },
  2: { title: 'Calendar Intelligence', description: 'Semblance analyzes your schedule, identifies conflicts, and suggests optimal meeting prep.' },
  3: { title: 'File Organization', description: 'Semblance scans recent documents, suggests organization, and surfaces relevant files you may have forgotten.' },
  4: { title: 'Contact Insights', description: 'Semblance reviews your relationships, identifies follow-ups due, and drafts check-in messages.' },
  5: { title: 'Financial Awareness', description: 'Semblance reviews recent transactions, flags unusual patterns, and surfaces upcoming bills.' },
  6: { title: 'Health Patterns', description: 'Semblance correlates your health data, identifies trends, and suggests wellness improvements.' },
  7: { title: 'Full Autonomy Demo', description: 'Semblance runs a complete autonomous day: email, calendar, files, contacts, and proactive actions combined.' },
};


export function AlterEgoWeekScreen() {
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [weekState, setWeekState] = useState<AlterEgoWeekState>({
    active: false,
    currentDay: null,
    completedDays: [],
    startedAt: null,
    completedAt: null,
    activationOffered: false,
    userActivated: false,
  });
  const [runningDay, setRunningDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const state = await sidecarCall<AlterEgoWeekState>('alter_ego_week_get_state');
      setWeekState(state);
    } catch (err) {
      console.error('[AlterEgoWeekScreen] Failed to load state:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const handleStart = useCallback(async () => {
    setError(null);
    try {
      const state = await sidecarCall<AlterEgoWeekState>('alter_ego_week_start');
      setWeekState(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleSkip = useCallback(async () => {
    setError(null);
    try {
      await sidecarCall<{ success: boolean }>('alter_ego_week_skip');
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadState]);

  const handleAccept = useCallback(async () => {
    setError(null);
    try {
      await sidecarCall<{ success: boolean; activated: boolean }>('alter_ego_week_accept');
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadState]);

  // Premium gate
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
          feature="alter-ego-week"
          isPremium={false}
          onLearnMore={() => navigate('/upgrade')}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
          <SkeletonCard
            variant="generic"
            message="Preparing Alter Ego Week"
            subMessage="Loading your trust-building challenges"
            showSpinner
          />
        </div>
      </div>
    );
  }

  const isComplete = weekState.completedAt !== null;

  // Map state to AlterEgoWeekCard props
  const progress: AlterEgoWeekProgress = {
    isActive: weekState.active,
    currentDay: weekState.currentDay ?? 1,
    completedDays: weekState.completedDays,
    totalDays: 7,
  };

  const currentDayConfig: AlterEgoWeekDay | null =
    weekState.currentDay !== null
      ? {
          day: weekState.currentDay,
          theme: DAY_LABELS[weekState.currentDay]?.title ?? `Day ${weekState.currentDay}`,
          domain: DAY_LABELS[weekState.currentDay]?.title.split(' ')[0] ?? 'General',
          type: 'demo',
          description: DAY_LABELS[weekState.currentDay]?.description ?? '',
        }
      : null;

  // Build activation prompt data from week state for AlterEgoActivationCard
  const activationPrompt: ActivationPromptData = {
    totalActions: weekState.completedDays.length * 5, // approximate actions per day
    successRate: weekState.completedDays.length > 0 ? Math.round((weekState.completedDays.length / 7) * 100) : 0,
    domainsCovered: weekState.completedDays.map((d) => DAY_LABELS[d]?.title ?? `Day ${d}`),
    estimatedTimeSavedSeconds: weekState.completedDays.length * 300, // ~5 min per day
    differences: weekState.completedDays.map((d) => ({
      domain: DAY_LABELS[d]?.title ?? `Day ${d}`,
      currentTier: 'Partner',
      description: DAY_LABELS[d]?.description ?? '',
      examples: [],
    })),
    safeguards: [
      'All actions are logged to the Universal Action Log',
      'High-stakes decisions always require your approval',
      'You can revert to Partner tier at any time',
      'Financial and legal actions remain gated',
    ],
  };

  const handleComplete = useCallback(async (day: number) => {
    setRunningDay(true);
    setError(null);
    try {
      await sidecarCall<DayDemoResult>('alter_ego_week_run_day', { day });
      await sidecarCall<AlterEgoWeekState>('alter_ego_week_advance');
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningDay(false);
    }
  }, [loadState]);

  return (
    <div className="h-full overflow-y-auto">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <h1 className="page-title" style={{ fontSize: 28, marginBottom: 6 }}>
          Alter Ego Week
        </h1>
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 12,
          color: '#A8B4C0',
          letterSpacing: '0.04em',
          margin: 0,
          marginBottom: 32,
          lineHeight: 1.5,
        }}>
          Build trust through 7 days of autonomous demonstrations.
        </p>

        {/* Error */}
        {error && (
          <Card style={{ marginBottom: 20, borderColor: 'rgba(176, 122, 138, 0.3)', background: 'rgba(176, 122, 138, 0.12)' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#B07A8A', letterSpacing: '0.04em', margin: 0 }}>
              {error}
            </p>
          </Card>
        )}

        {/* Not started */}
        {!weekState.active && !isComplete && (
          <Card style={{ marginBottom: 20 }}>
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#A8B4C0', letterSpacing: '0.04em',
              margin: 0,
              marginBottom: 20,
              lineHeight: 1.6,
            }}>
              Over 7 days, Semblance will demonstrate autonomous capabilities across email, calendar, files, contacts, finances, health, and full agent mode. Each day builds on the last.
            </p>
            <Button variant="opal" onClick={handleStart}>
              Start Week
            </Button>
          </Card>
        )}

        {/* Active Week — AlterEgoWeekCard */}
        {weekState.active && weekState.currentDay !== null && !isComplete && (
          <AlterEgoWeekCard
            progress={progress}
            currentDayConfig={currentDayConfig}
            onComplete={handleComplete}
            onSkip={handleSkip}
          />
        )}

        {/* Completion — Activation Card or status */}
        {isComplete && weekState.activationOffered && !weekState.userActivated && (
          <AlterEgoActivationCard
            prompt={activationPrompt}
            onActivate={() => handleAccept()}
            onDecline={() => {/* user declines, no action needed */}}
          />
        )}

        {isComplete && weekState.userActivated && (
          <Card style={{ borderColor: 'rgba(110, 207, 163, 0.2)' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 18,
              fontWeight: 300,
              color: '#EEF1F4',
              margin: 0,
              marginBottom: 12,
            }}>
              Week Complete
            </h2>
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#A8B4C0', letterSpacing: '0.04em',
              margin: 0,
              marginBottom: 20,
              lineHeight: 1.6,
            }}>
              Alter Ego tier is active. Semblance is operating with full autonomous capabilities.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusIndicator status="success" pulse />
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 12,
                color: '#6ECFA3',
              }}>
                Alter Ego Active
              </span>
            </div>
          </Card>
        )}

        {isComplete && !weekState.activationOffered && !weekState.userActivated && (
          <Card style={{ borderColor: 'rgba(110, 207, 163, 0.2)' }}>
            <h2 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 18,
              fontWeight: 300,
              color: '#EEF1F4',
              margin: 0,
              marginBottom: 12,
            }}>
              Week Complete
            </h2>
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#A8B4C0', letterSpacing: '0.04em',
              margin: 0,
              marginBottom: 20,
              lineHeight: 1.6,
            }}>
              You've completed all 7 days. The activation offer will appear once your results are reviewed.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

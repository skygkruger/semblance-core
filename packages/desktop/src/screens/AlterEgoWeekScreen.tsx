/**
 * AlterEgoWeekScreen — 7-day trust-building activation sequence.
 * DR-gated: requires Digital Representative license.
 * Backend handlers: alter_ego_week_get_state, alter_ego_week_start,
 * alter_ego_week_run_day, alter_ego_week_advance, alter_ego_week_skip, alter_ego_week_accept.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, SkeletonCard, StatusIndicator } from '@semblance/ui';
import { useLicense, LicenseCapabilityGate } from '../contexts/LicenseContext';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { PageContainer } from '../components/PageContainer';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { ShimmerDescription } from '../components/ShimmerDescription';
import { sidecarCall } from '../ipc/commands';
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
      if (state) {
        setWeekState({
          ...state,
          completedDays: state.completedDays ?? [],
        });
      }
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
      if (state) {
        setWeekState({
          ...state,
          completedDays: state.completedDays ?? [],
        });
      }
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
        <LicenseCapabilityGate feature="alter-ego-week" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
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
  const completedDays = weekState.completedDays ?? [];

  const progress: AlterEgoWeekProgress = {
    isActive: weekState.active,
    currentDay: weekState.currentDay ?? 1,
    completedDays,
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
    totalActions: completedDays.length * 5, // approximate actions per day
    successRate: completedDays.length > 0 ? Math.round((completedDays.length / 7) * 100) : 0,
    domainsCovered: completedDays.map((d) => DAY_LABELS[d]?.title ?? `Day ${d}`),
    estimatedTimeSavedSeconds: completedDays.length * 300, // ~5 min per day
    differences: completedDays.map((d) => ({
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

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Build trust through 7 days of autonomous demonstrations.">
        {/* Header */}
        <h1 className="page-title" style={{ fontSize: 28 }}>
          Alter Ego Week
        </h1>
        <ShimmerDescription text="Build trust through 7 days of autonomous demonstrations" />
        <PageContainer>
        <FeatureStatusBanner
          title="ALTER EGO WEEK"
          statusLabel={
            isComplete && weekState.userActivated ? 'ACTIVATED'
            : isComplete ? 'COMPLETE'
            : weekState.active ? `DAY ${weekState.currentDay ?? 1} OF 7`
            : 'NOT STARTED'
          }
          status={
            isComplete && weekState.userActivated ? 'active'
            : isComplete ? 'active'
            : weekState.active ? 'waiting'
            : 'inactive'
          }
        />

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, borderColor: 'rgba(232, 101, 122, 0.3)', background: 'rgba(232, 101, 122, 0.12)' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#E8657A', letterSpacing: '0.04em', margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        {/* Not started */}
        {!weekState.active && !isComplete && (
          <div style={{ marginBottom: 20 }}>
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
            <button type="button" className="btn btn--opal btn--sm" onClick={handleStart}>
              <span className="btn__text">Start Week</span>
            </button>
          </div>
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
          <div>
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
          </div>
        )}

        {isComplete && !weekState.activationOffered && !weekState.userActivated && (
          <div>
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
          </div>
        )}
        </PageContainer>
        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}

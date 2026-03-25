/**
 * AlterEgoWeekScreen — 7-day trust-building activation sequence.
 * DR-gated: requires Digital Representative license.
 * Backend handlers: alter_ego_week_get_state, alter_ego_week_start,
 * alter_ego_week_run_day, alter_ego_week_advance, alter_ego_week_skip, alter_ego_week_accept.
 */

import { useState, useEffect, useCallback } from 'react';
import { sidecarCall } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';

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
  const [dayResult, setDayResult] = useState<DayDemoResult | null>(null);
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

  const handleRunDay = useCallback(async () => {
    if (weekState.currentDay === null) return;
    setRunningDay(true);
    setError(null);
    setDayResult(null);
    try {
      const result = await sidecarCall<DayDemoResult>('alter_ego_week_run_day', { day: weekState.currentDay });
      setDayResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningDay(false);
    }
  }, [weekState.currentDay]);

  const handleAdvance = useCallback(async () => {
    setError(null);
    setDayResult(null);
    try {
      const state = await sidecarCall<AlterEgoWeekState>('alter_ego_week_advance');
      setWeekState(state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleSkip = useCallback(async () => {
    setError(null);
    setDayResult(null);
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
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'Fraunces Variable', 'Fraunces', Georgia, serif",
          fontSize: 28,
          fontWeight: 300,
          color: '#EEF1F4',
          margin: 0,
          marginBottom: 6,
        }}>
          Alter Ego Week
        </h1>
        <div style={{
          background: '#111518',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12,
          padding: 24,
          marginTop: 24,
        }}>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: '#A8B4C0',
            margin: 0,
            lineHeight: 1.6,
          }}>
            Alter Ego Week is a 7-day trust-building sequence that demonstrates autonomous capabilities. This feature requires the Digital Representative tier.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
        <div style={{ color: '#8593A4', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14 }}>
          Loading...
        </div>
      </div>
    );
  }

  const allDays = [1, 2, 3, 4, 5, 6, 7];
  const isComplete = weekState.completedAt !== null;

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{
        fontFamily: "'Fraunces Variable', 'Fraunces', Georgia, serif",
        fontSize: 28,
        fontWeight: 300,
        color: '#EEF1F4',
        margin: 0,
        marginBottom: 6,
      }}>
        Alter Ego Week
      </h1>
      <p style={{
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontSize: 14,
        color: '#A8B4C0',
        margin: 0,
        marginBottom: 32,
        lineHeight: 1.5,
      }}>
        Build trust through 7 days of autonomous demonstrations.
      </p>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(176, 122, 138, 0.12)',
          border: '1px solid rgba(176, 122, 138, 0.3)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}>
          <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#B07A8A', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* 7-Day Timeline */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 24,
      }}>
        {allDays.map((day) => {
          const isCompleted = weekState.completedDays.includes(day);
          const isCurrent = weekState.currentDay === day;
          let bg = 'rgba(255,255,255,0.04)';
          let color = '#5E6B7C';
          if (isCompleted) { bg = 'rgba(110, 207, 163, 0.15)'; color = '#6ECFA3'; }
          else if (isCurrent) { bg = 'rgba(110, 207, 163, 0.08)'; color = '#CDD4DB'; }
          return (
            <div key={day} style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px 0',
              borderRadius: 8,
              background: bg,
              border: isCurrent ? '1px solid rgba(110, 207, 163, 0.3)' : '1px solid transparent',
            }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color }}>{day}</div>
            </div>
          );
        })}
      </div>

      {/* Not started */}
      {!weekState.active && !isComplete && (
        <div style={{
          background: '#111518',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: '#A8B4C0',
            margin: 0,
            marginBottom: 20,
            lineHeight: 1.6,
          }}>
            Over 7 days, Semblance will demonstrate autonomous capabilities across email, calendar, files, contacts, finances, health, and full agent mode. Each day builds on the last.
          </p>
          <button onClick={handleStart} style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: '#0B0E11',
            background: '#6ECFA3',
            border: 'none',
            borderRadius: 8,
            padding: '8px 20px',
            cursor: 'pointer',
          }}>
            Start Week
          </button>
        </div>
      )}

      {/* Current Day Card */}
      {weekState.active && weekState.currentDay !== null && !isComplete && (
        <div style={{
          background: '#111518',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 12,
          padding: 24,
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#6ECFA3',
              background: 'rgba(110, 207, 163, 0.1)',
              padding: '2px 8px',
              borderRadius: 4,
            }}>
              Day {weekState.currentDay}
            </span>
            <h2 style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 16,
              fontWeight: 500,
              color: '#CDD4DB',
              margin: 0,
            }}>
              {DAY_LABELS[weekState.currentDay]?.title ?? `Day ${weekState.currentDay}`}
            </h2>
          </div>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 13,
            color: '#A8B4C0',
            margin: 0,
            marginBottom: 20,
            lineHeight: 1.6,
          }}>
            {DAY_LABELS[weekState.currentDay]?.description ?? ''}
          </p>

          {/* Day Result */}
          {dayResult && (
            <div style={{
              background: '#171B1F',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: '#CDD4DB', marginBottom: 8 }}>
                {dayResult.title}
              </div>
              {dayResult.description && (
                <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 13, color: '#A8B4C0', margin: 0, lineHeight: 1.5 }}>
                  {dayResult.description}
                </p>
              )}
              {dayResult.actions && dayResult.actions.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dayResult.actions.map((action, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, color: '#8593A4' }}>{action.label}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6ECFA3' }}>{action.result}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleRunDay}
              disabled={runningDay}
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#0B0E11',
                background: '#6ECFA3',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                cursor: runningDay ? 'not-allowed' : 'pointer',
                opacity: runningDay ? 0.6 : 1,
              }}
            >
              {runningDay ? 'Running...' : "Run Today's Challenge"}
            </button>
            {dayResult && (
              <button onClick={handleAdvance} style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                color: '#EEF1F4',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 8,
                padding: '8px 20px',
                cursor: 'pointer',
              }}>
                Advance
              </button>
            )}
            <button onClick={handleSkip} style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: '#5E6B7C',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '8px 20px',
              cursor: 'pointer',
            }}>
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Completion State */}
      {isComplete && (
        <div style={{
          background: '#111518',
          border: '1px solid rgba(110, 207, 163, 0.2)',
          borderRadius: 12,
          padding: 24,
        }}>
          <h2 style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            color: '#CDD4DB',
            margin: 0,
            marginBottom: 12,
          }}>
            Week Complete
          </h2>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: '#A8B4C0',
            margin: 0,
            marginBottom: 20,
            lineHeight: 1.6,
          }}>
            {weekState.userActivated
              ? 'Alter Ego tier is active. Semblance is operating with full autonomous capabilities.'
              : 'You\'ve completed all 7 days. Would you like to activate Alter Ego tier? Semblance will act on your behalf for nearly everything, interrupting only for high-stakes decisions.'}
          </p>
          {weekState.activationOffered && !weekState.userActivated && (
            <button onClick={handleAccept} style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: '#0B0E11',
              background: '#6ECFA3',
              border: 'none',
              borderRadius: 8,
              padding: '8px 20px',
              cursor: 'pointer',
            }}>
              Activate Alter Ego
            </button>
          )}
          {weekState.userActivated && (
            <div style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12,
              color: '#6ECFA3',
              background: 'rgba(110, 207, 163, 0.08)',
              padding: '6px 12px',
              borderRadius: 6,
              display: 'inline-block',
            }}>
              Alter Ego Active
            </div>
          )}
        </div>
      )}
    </div>
  );
}

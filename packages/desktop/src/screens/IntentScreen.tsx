// IntentScreen — View and manage primary goal, hard limits, personal values, and alignment observations.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppState, useAppDispatch } from '../state/AppState';
import {
  getIntent,
  setPrimaryGoal,
  addHardLimit,
  removeHardLimit,
  toggleHardLimit,
  addPersonalValue,
  removePersonalValue,
  getIntentObservations,
  dismissObservation,
} from '../ipc/commands';
import type { IntentObservationData } from '../ipc/types';

export function IntentScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [newValue, setNewValue] = useState('');
  const [observations, setObservations] = useState<IntentObservationData[]>([]);
  const [loading, setLoading] = useState(true);

  // Load intent on mount
  useEffect(() => {
    Promise.all([
      getIntent().then(profile => {
        if (profile) {
          dispatch({
            type: 'SET_INTENT_PROFILE',
            profile: {
              primaryGoal: profile.primaryGoal,
              hardLimits: profile.hardLimits.map(l => ({
                id: l.id,
                rawText: l.rawText,
                active: l.active,
                source: l.source,
                createdAt: l.createdAt,
              })),
              personalValues: profile.personalValues.map(v => ({
                id: v.id,
                rawText: v.rawText,
                theme: v.theme,
                active: v.active,
                source: v.source,
                createdAt: v.createdAt,
              })),
              lastUpdated: profile.updatedAt,
            },
          });
        }
      }).catch(() => {}),
      getIntentObservations().then(setObservations).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [dispatch]);

  const handleSaveGoal = useCallback(async () => {
    if (!goalDraft.trim()) return;
    await setPrimaryGoal(goalDraft.trim()).catch(() => {});
    dispatch({ type: 'SET_PRIMARY_GOAL', goal: goalDraft.trim() });
    setEditingGoal(false);
  }, [goalDraft, dispatch]);

  const handleAddLimit = useCallback(async () => {
    if (!newLimit.trim()) return;
    const result = await addHardLimit(newLimit.trim(), 'settings').catch(() => null);
    if (result) {
      dispatch({
        type: 'ADD_HARD_LIMIT',
        limit: { id: result.id, rawText: result.rawText, active: result.active, source: result.source, createdAt: result.createdAt },
      });
    }
    setNewLimit('');
  }, [newLimit, dispatch]);

  const handleRemoveLimit = useCallback(async (id: string) => {
    await removeHardLimit(id).catch(() => {});
    dispatch({ type: 'REMOVE_HARD_LIMIT', id });
  }, [dispatch]);

  const handleToggleLimit = useCallback(async (id: string, active: boolean) => {
    await toggleHardLimit(id, active).catch(() => {});
    dispatch({ type: 'TOGGLE_HARD_LIMIT', id, active });
  }, [dispatch]);

  const handleAddValue = useCallback(async () => {
    if (!newValue.trim()) return;
    const result = await addPersonalValue(newValue.trim(), 'settings').catch(() => null);
    if (result) {
      dispatch({
        type: 'ADD_PERSONAL_VALUE',
        value: { id: result.id, rawText: result.rawText, theme: result.theme, active: result.active, source: result.source, createdAt: result.createdAt },
      });
    }
    setNewValue('');
  }, [newValue, dispatch]);

  const handleRemoveValue = useCallback(async (id: string) => {
    await removePersonalValue(id).catch(() => {});
    dispatch({ type: 'REMOVE_PERSONAL_VALUE', id });
  }, [dispatch]);

  const handleDismissObservation = useCallback(async (id: string) => {
    await dismissObservation(id).catch(() => {});
    setObservations(prev => prev.filter(o => o.id !== id));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#8593A4' }}>{t('screen.intent.loading')}</div>
    );
  }

  const { primaryGoal, hardLimits, personalValues } = state.intentProfile;

  return (
    <div style={{
      padding: 32,
      maxWidth: 640,
      margin: '0 auto',
      color: '#EEF1F4',
      fontFamily: 'var(--fb)',
    }}>
      <h1 style={{
        fontFamily: 'var(--fd)',
        fontSize: 28,
        fontWeight: 400,
        marginBottom: 32,
        color: '#EEF1F4',
      }}>
        {t('screen.intent.title')}
      </h1>

      {/* Primary Goal */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionHeading}>{t('screen.intent.section_goal')}</h2>
        {editingGoal ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={goalDraft}
              onChange={e => setGoalDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); }}
              placeholder={t('screen.intent.placeholder_goal')}
              style={inputStyle}
              autoFocus
            />
            <button type="button" onClick={handleSaveGoal} style={btnPrimary}>{t('button.save')}</button>
            <button type="button" onClick={() => setEditingGoal(false)} style={btnGhost}>{t('button.cancel')}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ margin: 0, color: primaryGoal ? '#EEF1F4' : '#8593A4', fontSize: 14 }}>
              {primaryGoal || t('screen.intent.goal_empty')}
            </p>
            <button
              type="button"
              onClick={() => { setGoalDraft(primaryGoal || ''); setEditingGoal(true); }}
              style={btnGhost}
            >
              {t('button.edit')}
            </button>
          </div>
        )}
      </section>

      {/* Hard Limits */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionHeading}>{t('screen.intent.section_limits')}</h2>
        {hardLimits.length === 0 && (
          <p style={{ color: '#8593A4', fontSize: 13, margin: '0 0 12px' }}>{t('screen.intent.limits_empty')}</p>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {hardLimits.map(limit => (
            <li key={limit.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderBottom: '1px solid #1E2228',
            }}>
              <button
                type="button"
                onClick={() => handleToggleLimit(limit.id, !limit.active)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: `1.5px solid ${limit.active ? '#6ECFA3' : '#3A3F47'}`,
                  backgroundColor: limit.active ? '#6ECFA320' : 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title={limit.active ? t('screen.intent.limit_active_title') : t('screen.intent.limit_inactive_title')}
              />
              <span style={{
                flex: 1,
                fontSize: 14,
                color: limit.active ? '#EEF1F4' : '#8593A4',
                textDecoration: limit.active ? 'none' : 'line-through',
              }}>
                {limit.rawText}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveLimit(limit.id)}
                style={{ ...btnGhost, color: '#C97B6E', fontSize: 12 }}
              >
                {t('button.remove')}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={newLimit}
            onChange={e => setNewLimit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddLimit(); }}
            placeholder={t('screen.intent.placeholder_limit')}
            style={inputStyle}
          />
          <button type="button" onClick={handleAddLimit} disabled={!newLimit.trim()} style={btnPrimary}>{t('button.create')}</button>
        </div>
      </section>

      {/* Personal Values */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={sectionHeading}>{t('screen.intent.section_values')}</h2>
        {personalValues.length === 0 && (
          <p style={{ color: '#8593A4', fontSize: 13, margin: '0 0 12px' }}>{t('screen.intent.values_empty')}</p>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
          {personalValues.map(value => (
            <li key={value.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderBottom: '1px solid #1E2228',
            }}>
              <span style={{ flex: 1, fontSize: 14, color: '#EEF1F4' }}>
                {value.rawText}
              </span>
              {value.theme && (
                <span style={{
                  fontSize: 11,
                  color: '#6ECFA3',
                  backgroundColor: '#6ECFA315',
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontFamily: 'var(--fm)',
                }}>
                  {value.theme}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveValue(value.id)}
                style={{ ...btnGhost, color: '#C97B6E', fontSize: 12 }}
              >
                {t('button.remove')}
              </button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddValue(); }}
            placeholder={t('screen.intent.placeholder_value')}
            style={inputStyle}
          />
          <button type="button" onClick={handleAddValue} disabled={!newValue.trim()} style={btnPrimary}>{t('button.create')}</button>
        </div>
      </section>

      {/* Recent Alignment Observations */}
      {observations.length > 0 && (
        <section>
          <h2 style={sectionHeading}>{t('screen.intent.section_alignment')}</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {observations.slice(0, 10).map(obs => (
              <li key={obs.id} style={{
                padding: '10px 0',
                borderBottom: '1px solid #1E2228',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <span style={{
                  fontSize: 10,
                  fontFamily: 'var(--fm)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  backgroundColor: obs.type === 'drift' ? '#C9A85C20' : obs.type === 'conflict' ? '#C97B6E20' : '#6ECFA320',
                  color: obs.type === 'drift' ? '#C9A85C' : obs.type === 'conflict' ? '#C97B6E' : '#6ECFA3',
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  {obs.type}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#EEF1F4' }}>{obs.description}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#8593A4' }}>
                    {new Date(obs.observedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissObservation(obs.id)}
                  style={btnGhost}
                >
                  {t('button.dismiss')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Shared Styles ──────────────────────────────────────────────────────────

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--fm)',
  fontSize: 11,
  fontWeight: 400,
  color: '#5E6B7C',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 36,
  padding: '0 12px',
  border: '1px solid #2A2F35',
  borderRadius: 6,
  backgroundColor: '#141820',
  color: '#EEF1F4',
  fontSize: 13,
  fontFamily: 'var(--fb)',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  height: 36,
  padding: '0 16px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#6ECFA3',
  color: '#0B0E11',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'var(--fb)',
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8593A4',
  fontSize: 13,
  fontFamily: 'var(--fb)',
  cursor: 'pointer',
  padding: '4px 8px',
};

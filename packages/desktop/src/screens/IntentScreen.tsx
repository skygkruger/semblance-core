// IntentScreen — View and manage primary goal, hard limits, personal values, and alignment observations.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
  getEscalationPrompts,
  respondToEscalation,
} from '../ipc/commands';
import type { IntentObservationData, EscalationPromptData } from '../ipc/types';
import { EscalationPromptCard } from '../components/EscalationPromptCard';

export function IntentScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [newValue, setNewValue] = useState('');
  const [observations, setObservations] = useState<IntentObservationData[]>([]);
  const [escalationPrompts, setEscalationPrompts] = useState<EscalationPromptData[]>([]);
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
      getEscalationPrompts().then(setEscalationPrompts).catch(() => {}),
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
      <div className="settings-screen">
        <div className="settings-header">
          <button type="button" className="settings-header__back" onClick={() => navigate('/settings')} aria-label="Back to settings">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <h1 className="settings-header__title">{t('screen.intent.title')}</h1>
        </div>
        <div className="settings-content">
          <span style={{ color: '#8593A4', fontSize: 13 }}>{t('screen.intent.loading')}</span>
        </div>
      </div>
    );
  }

  const { primaryGoal, hardLimits, personalValues } = state.intentProfile;

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={() => navigate('/settings')} aria-label="Back to settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="settings-header__title">{t('screen.intent.title')}</h1>
      </div>
      <div className="settings-content">
        {/* Primary Goal */}
        <div className="settings-section-header">{t('screen.intent.section_goal')}</div>
        <div className="settings-row settings-row--static">
          {editingGoal ? (
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <input
                type="text"
                value={goalDraft}
                onChange={e => setGoalDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); }}
                placeholder={t('screen.intent.placeholder_goal')}
                style={{ flex: 1, height: 36, padding: '0 12px', border: '1px solid #2A2F35', borderRadius: 6, backgroundColor: '#141820', color: '#EEF1F4', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                autoFocus
              />
              <button type="button" className="btn btn--opal btn--sm" onClick={handleSaveGoal}><span className="btn__text">{t('button.save')}</span></button>
              <button type="button" onClick={() => setEditingGoal(false)} style={{ background: 'none', border: 'none', color: '#8593A4', fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '4px 8px' }}>{t('button.cancel')}</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <span className="settings-row__label" style={{ flex: 1, color: primaryGoal ? '#EEF1F4' : '#8593A4', fontSize: 14 }}>
                {primaryGoal || t('screen.intent.goal_empty')}
              </span>
              <button
                type="button"
                onClick={() => { setGoalDraft(primaryGoal || ''); setEditingGoal(true); }}
                style={{ background: 'none', border: 'none', color: '#8593A4', fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '4px 8px' }}
              >
                {t('button.edit')}
              </button>
            </div>
          )}
        </div>

        {/* Hard Limits */}
        <div className="settings-section-header" style={{ marginTop: 24 }}>{t('screen.intent.section_limits')}</div>
        {hardLimits.length === 0 && (
          <div className="settings-row settings-row--static">
            <span className="settings-row__label" style={{ color: '#5E6B7C', fontSize: 13 }}>{t('screen.intent.limits_empty')}</span>
          </div>
        )}
        {hardLimits.map(limit => (
          <div key={limit.id} className="settings-row">
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
            <span className="settings-row__label" style={{
              flex: 1,
              color: limit.active ? '#EEF1F4' : '#8593A4',
              textDecoration: limit.active ? 'none' : 'line-through',
            }}>
              {limit.rawText}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveLimit(limit.id)}
              style={{ background: 'none', border: 'none', color: '#B07A8A', fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '4px 8px' }}
            >
              {t('button.remove')}
            </button>
          </div>
        ))}
        <div className="settings-row settings-row--static" style={{ gap: 8 }}>
          <input
            type="text"
            value={newLimit}
            onChange={e => setNewLimit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddLimit(); }}
            placeholder={t('screen.intent.placeholder_limit')}
            style={{ flex: 1, height: 36, padding: '0 12px', border: '1px solid #2A2F35', borderRadius: 6, backgroundColor: '#141820', color: '#EEF1F4', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          />
          <button type="button" className="btn btn--opal btn--sm" onClick={handleAddLimit} disabled={!newLimit.trim()}><span className="btn__text">{t('button.create')}</span></button>
        </div>

        {/* Personal Values */}
        <div className="settings-section-header" style={{ marginTop: 24 }}>{t('screen.intent.section_values')}</div>
        {personalValues.length === 0 && (
          <div className="settings-row settings-row--static">
            <span className="settings-row__label" style={{ color: '#5E6B7C', fontSize: 13 }}>{t('screen.intent.values_empty')}</span>
          </div>
        )}
        {personalValues.map(value => (
          <div key={value.id} className="settings-row">
            <span className="settings-row__label" style={{ flex: 1 }}>
              {value.rawText}
            </span>
            {value.theme && (
              <span style={{
                fontSize: 11,
                color: '#6ECFA3',
                backgroundColor: '#6ECFA315',
                padding: '2px 8px',
                borderRadius: 9999,
                fontFamily: "'DM Mono', monospace",
              }}>
                {value.theme}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleRemoveValue(value.id)}
              style={{ background: 'none', border: 'none', color: '#B07A8A', fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '4px 8px' }}
            >
              {t('button.remove')}
            </button>
          </div>
        ))}
        <div className="settings-row settings-row--static" style={{ gap: 8 }}>
          <input
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddValue(); }}
            placeholder={t('screen.intent.placeholder_value')}
            style={{ flex: 1, height: 36, padding: '0 12px', border: '1px solid #2A2F35', borderRadius: 6, backgroundColor: '#141820', color: '#EEF1F4', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
          />
          <button type="button" className="btn btn--opal btn--sm" onClick={handleAddValue} disabled={!newValue.trim()}><span className="btn__text">{t('button.create')}</span></button>
        </div>

        {/* Escalation Prompts */}
        {escalationPrompts.length > 0 && (
          <>
            <div className="settings-section-header" style={{ marginTop: 24 }}>{t('screen.intent.section_escalation', 'Autonomy Escalation')}</div>
            {escalationPrompts.map(prompt => (
              <div key={prompt.id} style={{ padding: '0 16px', marginBottom: 12 }}>
                <EscalationPromptCard
                  prompt={prompt}
                  onAccepted={async () => {
                    await respondToEscalation(prompt.id, true).catch(() => {});
                    setEscalationPrompts(prev => prev.filter(p => p.id !== prompt.id));
                  }}
                  onDismissed={async () => {
                    await respondToEscalation(prompt.id, false).catch(() => {});
                    setEscalationPrompts(prev => prev.filter(p => p.id !== prompt.id));
                  }}
                />
              </div>
            ))}
          </>
        )}

        {/* Recent Alignment Observations */}
        {observations.length > 0 && (
          <>
            <div className="settings-section-header" style={{ marginTop: 24 }}>{t('screen.intent.section_alignment')}</div>
            {observations.slice(0, 10).map(obs => (
              <div key={obs.id} className="settings-row" style={{ alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 10,
                  fontFamily: "'DM Mono', monospace",
                  padding: '2px 6px',
                  borderRadius: 4,
                  backgroundColor: obs.type === 'drift' ? '#B09A8A20' : obs.type === 'conflict' ? '#B07A8A20' : '#6ECFA320',
                  color: obs.type === 'drift' ? '#B09A8A' : obs.type === 'conflict' ? '#B07A8A' : '#6ECFA3',
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
                  style={{ background: 'none', border: 'none', color: '#8593A4', fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', padding: '4px 8px' }}
                >
                  {t('button.dismiss')}
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

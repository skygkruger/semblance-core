// IntentScreen — View and manage primary goal, hard limits, personal values, and alignment observations.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { emit } from '@tauri-apps/api/event';
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
import { ContentBracket } from '../components/ContentBracket';
import { Card, Button, Input, SkeletonCard, StatusIndicator } from '@semblance/ui';

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

  const showError = useCallback((message: string) => {
    emit('semblance://toast', { id: `toast_${Date.now()}`, message, variant: 'error' }).catch(() => {});
  }, []);

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
    await setPrimaryGoal(goalDraft.trim()).catch(() => showError('Failed to save goal'));
    dispatch({ type: 'SET_PRIMARY_GOAL', goal: goalDraft.trim() });
    setEditingGoal(false);
  }, [goalDraft, dispatch, showError]);

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
    await removeHardLimit(id).catch(() => showError('Failed to remove limit'));
    dispatch({ type: 'REMOVE_HARD_LIMIT', id });
  }, [dispatch, showError]);

  const handleToggleLimit = useCallback(async (id: string, active: boolean) => {
    await toggleHardLimit(id, active).catch(() => showError('Failed to update limit'));
    dispatch({ type: 'TOGGLE_HARD_LIMIT', id, active });
  }, [dispatch, showError]);

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
    await removePersonalValue(id).catch(() => showError('Failed to remove value'));
    dispatch({ type: 'REMOVE_PERSONAL_VALUE', id });
  }, [dispatch, showError]);

  const handleDismissObservation = useCallback(async (id: string) => {
    await dismissObservation(id).catch(() => showError('Failed to dismiss observation'));
    setObservations(prev => prev.filter(o => o.id !== id));
  }, [showError]);

  if (loading) {
    return (
      <div className="page-scroll">
        <div className="page-layout settings-screen">
          <ContentBracket>
          <div className="settings-header">
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Button>
            <h1 className="settings-header__title">{t('screen.intent.title')}</h1>
          </div>
          <div className="settings-content">
            <SkeletonCard variant="generic" message="Loading intents" subMessage="Retrieving your preferences and limits" showSpinner />
          </div>
          </ContentBracket>
        </div>
      </div>
    );
  }

  const { primaryGoal, hardLimits, personalValues } = state.intentProfile;

  return (
    <div className="page-scroll">
    <div className="page-layout settings-screen">
      <ContentBracket>
      <div className="settings-header">
        <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Button>
        <h1 className="settings-header__title">{t('screen.intent.title')}</h1>
      </div>
      <div className="settings-content">
        {/* Primary Goal */}
        <Card variant="default">
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>{t('screen.intent.section_goal')}</h2>
          {editingGoal ? (
            <div style={{ display: 'flex', gap: 8, width: '100%', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <Input
                  value={goalDraft}
                  onChange={e => setGoalDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); }}
                  placeholder={t('screen.intent.placeholder_goal')}
                  autoFocus
                />
              </div>
              <Button variant="opal" size="sm" onClick={handleSaveGoal}>{t('button.save')}</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingGoal(false)}>{t('button.cancel')}</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <span style={{ flex: 1, fontFamily: "'DM Mono', monospace", color: primaryGoal ? '#EEF1F4' : '#5E6B7C', fontSize: 12, letterSpacing: '0.04em' }}>
                {primaryGoal || t('screen.intent.goal_empty')}
              </span>
              <Button variant="ghost" size="sm" onClick={() => { setGoalDraft(primaryGoal || ''); setEditingGoal(true); }}>{t('button.edit')}</Button>
            </div>
          )}
        </Card>

        {/* Hard Limits */}
        <Card variant="default" className="mt-4">
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>{t('screen.intent.section_limits')}</h2>
          {hardLimits.length === 0 && (
            <p style={{ fontFamily: "'DM Mono', monospace", color: '#5E6B7C', fontSize: 11, letterSpacing: '0.04em', margin: 0 }}>{t('screen.intent.limits_empty')}</p>
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
                color: limit.active ? '#EEF1F4' : '#5E6B7C',
                textDecoration: limit.active ? 'none' : 'line-through',
              }}>
                {limit.rawText}
              </span>
              <Button variant="destructive" size="sm" onClick={() => handleRemoveLimit(limit.id)}>{t('button.remove')}</Button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <Input
                value={newLimit}
                onChange={e => setNewLimit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddLimit(); }}
                placeholder={t('screen.intent.placeholder_limit')}
              />
            </div>
            <Button variant="opal" size="sm" onClick={handleAddLimit} disabled={!newLimit.trim()}>{t('button.create')}</Button>
          </div>
        </Card>

        {/* Personal Values */}
        <Card variant="default" className="mt-4">
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>{t('screen.intent.section_values')}</h2>
          {personalValues.length === 0 && (
            <p style={{ fontFamily: "'DM Mono', monospace", color: '#5E6B7C', fontSize: 11, letterSpacing: '0.04em', margin: 0 }}>{t('screen.intent.values_empty')}</p>
          )}
          {personalValues.map(value => (
            <div key={value.id} className="settings-row">
              <span className="settings-row__label" style={{ flex: 1 }}>
                {value.rawText}
              </span>
              {value.theme && (
                <StatusIndicator status="success" />
              )}
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
              <Button variant="destructive" size="sm" onClick={() => handleRemoveValue(value.id)}>{t('button.remove')}</Button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <Input
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddValue(); }}
                placeholder={t('screen.intent.placeholder_value')}
              />
            </div>
            <Button variant="opal" size="sm" onClick={handleAddValue} disabled={!newValue.trim()}>{t('button.create')}</Button>
          </div>
        </Card>

        {/* Escalation Prompts */}
        {escalationPrompts.length > 0 && (
          <Card variant="default" className="mt-4">
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>{t('screen.intent.section_escalation', 'Autonomy Escalation')}</h2>
            {escalationPrompts.map(prompt => (
              <div key={prompt.id} style={{ marginBottom: 12 }}>
                <EscalationPromptCard
                  prompt={prompt}
                  onAccepted={async () => {
                    await respondToEscalation(prompt.id, true).catch(() => showError('Failed to accept escalation'));
                    setEscalationPrompts(prev => prev.filter(p => p.id !== prompt.id));
                  }}
                  onDismissed={async () => {
                    await respondToEscalation(prompt.id, false).catch(() => showError('Failed to dismiss escalation'));
                    setEscalationPrompts(prev => prev.filter(p => p.id !== prompt.id));
                  }}
                />
              </div>
            ))}
          </Card>
        )}

        {/* Recent Alignment Observations */}
        {observations.length > 0 && (
          <Card variant="default" className="mt-4">
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>{t('screen.intent.section_alignment')}</h2>
            {observations.slice(0, 10).map(obs => (
              <div key={obs.id} className="settings-row" style={{ alignItems: 'flex-start' }}>
                <StatusIndicator
                  status={obs.type === 'drift' ? 'attention' : obs.type === 'conflict' ? 'attention' : 'success'}
                />
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
                  <p style={{ margin: 0, fontSize: 12, color: '#EEF1F4', fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>{obs.description}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>
                    {new Date(obs.observedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDismissObservation(obs.id)}>{t('button.dismiss')}</Button>
              </div>
            ))}
          </Card>
        )}
      </div>
      </ContentBracket>
    </div>
    </div>
  );
}

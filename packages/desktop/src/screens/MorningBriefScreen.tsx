// MorningBriefScreen — Desktop wrapper for the Morning Brief view.
// Fetches brief data via IPC and renders BriefingCard, MorningBriefCard,
// WeatherCard, CommuteCard, KnowledgeMomentDisplay, and AlterEgoActivationCard.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BriefingCard, SkeletonCard } from '@semblance/ui';
import type { BriefingItem } from '@semblance/ui';
import { MorningBriefCard } from '../components/MorningBriefCard';
import { WeatherCard } from '../components/WeatherCard';
import { CommuteCard } from '../components/CommuteCard';
import { KnowledgeMomentDisplay } from '../components/KnowledgeMomentDisplay';
import { AlterEgoActivationCard } from '../components/AlterEgoActivationCard';
import { DailyDigestCard } from '../components/DailyDigestCard';
import { useAppState } from '../state/AppState';
import { useLicense } from '../contexts/LicenseContext';
import {
  getMorningBrief,
  getWeather,
  getCommutes,
  getKnowledgeMoment,
  getAlterEgoActivationPrompt,
  getDailyDigest,
  dismissMorningBrief,
  dismissDailyDigest,
} from '../ipc/commands';
import type {
  MorningBriefResult,
  WeatherResult,
  CommuteResult,
  KnowledgeMomentResult,
  AlterEgoActivationResult,
  DailyDigestResult,
} from '../ipc/types';

export function MorningBriefScreen() {
  const { t } = useTranslation('morning-brief');
  const state = useAppState();
  const license = useLicense();
  const aiName = state.semblanceName || 'Semblance';

  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<MorningBriefResult | null>(null);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [commutes, setCommutes] = useState<CommuteResult | null>(null);
  const [knowledgeMoment, setKnowledgeMoment] = useState<KnowledgeMomentResult | null>(null);
  const [activationPrompt, setActivationPrompt] = useState<AlterEgoActivationResult | null>(null);
  const [dailyDigest, setDailyDigest] = useState<DailyDigestResult | null>(null);

  useEffect(() => {
    Promise.allSettled([
      getMorningBrief().then(setBrief).catch(() => {}),
      getWeather().then(setWeather).catch(() => {}),
      getCommutes().then(setCommutes).catch(() => {}),
      getKnowledgeMoment().then(setKnowledgeMoment).catch(() => {}),
      getAlterEgoActivationPrompt().then(setActivationPrompt).catch(() => {}),
      getDailyDigest().then(setDailyDigest).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const handleDismissBrief = useCallback(async (id: string) => {
    await dismissMorningBrief(id).catch(() => {});
    setBrief(null);
  }, []);

  const handleDismissDigest = useCallback(async (id: string) => {
    await dismissDailyDigest(id).catch(() => {});
    setDailyDigest(null);
  }, []);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-container-lg mx-auto px-6 py-8 space-y-4">
          <SkeletonCard variant="briefing" message={t('card.loading')} />
          <SkeletonCard variant="generic" />
          <SkeletonCard variant="generic" />
        </div>
      </div>
    );
  }

  // Build BriefingCard items from brief data
  const briefingItems: BriefingItem[] = [];
  if (brief?.sections) {
    for (const section of brief.sections) {
      for (const item of section.items) {
        briefingItems.push({
          type: item.actionable ? 'action' : 'insight',
          text: item.text,
        });
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
        <h1 style={{
          fontFamily: "'Fraunces Variable', 'Fraunces', Georgia, serif",
          fontSize: 28,
          fontWeight: 400,
          color: '#EEF1F4',
          margin: 0,
        }}>
          {(() => {
            const hour = new Date().getHours();
            const period = hour < 12 ? t('greeting.morning') : hour < 17 ? t('greeting.afternoon') : t('greeting.evening');
            return state.userName
              ? t('greeting.with_name', { period, name: state.userName })
              : t('greeting.anonymous', { period });
          })()}
        </h1>

        {/* Briefing summary card */}
        {briefingItems.length > 0 && (
          <BriefingCard
            items={briefingItems}
            userName={state.userName || undefined}
            isFoundingMember={license.isFoundingMember}
            foundingSeat={license.foundingSeat ?? undefined}
          />
        )}

        {/* Morning Brief (full article-style) */}
        {brief && (
          <MorningBriefCard
            brief={{
              id: brief.id,
              summary: brief.summary,
              sections: brief.sections,
              estimatedReadTimeSeconds: brief.estimatedReadTimeSeconds,
              dismissed: false,
            }}
            onDismiss={handleDismissBrief}
          />
        )}

        {/* Weather + Commute row */}
        {(weather || commutes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weather && (
              <WeatherCard
                currentConditions={weather.currentConditions}
                eventForecasts={weather.eventForecasts}
              />
            )}
            {commutes && commutes.commutes.length > 0 && (
              <CommuteCard commutes={commutes.commutes} />
            )}
          </div>
        )}

        {/* Knowledge Moment */}
        {knowledgeMoment && (
          <KnowledgeMomentDisplay
            moment={knowledgeMoment}
            aiName={aiName}
            onContinue={() => {
              // Navigate to chat to continue the knowledge conversation
              window.location.hash = '#/chat';
            }}
          />
        )}

        {/* Alter Ego Activation Prompt */}
        {activationPrompt && (
          <AlterEgoActivationCard
            prompt={activationPrompt}
            onActivate={() => setActivationPrompt(null)}
            onDecline={() => setActivationPrompt(null)}
          />
        )}

        {/* Daily Digest */}
        {dailyDigest && (
          <DailyDigestCard
            digest={dailyDigest}
            onDismiss={handleDismissDigest}
          />
        )}

        {/* Empty state — polished card matching app design */}
        {!brief && !weather && !commutes && !knowledgeMoment && !activationPrompt && !dailyDigest && (
          <div style={{
            background: 'linear-gradient(135deg, #171B1F, #111518)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: 32,
            maxWidth: 520,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6ECFA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                fontWeight: 400,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.1em',
                color: '#6ECFA3',
              }}>
                {t('card.empty_label', 'YOUR BRIEFING')}
              </span>
            </div>

            <p style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 15,
              fontWeight: 300,
              color: '#A8B4C0',
              lineHeight: 1.6,
              margin: '0 0 12px 0',
            }}>
              {t('card.empty_body', `${aiName} will prepare your daily briefing once your data sources are connected. Email, calendar, and files are used to surface what matters today.`)}
            </p>

            <p style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 13,
              fontWeight: 300,
              color: '#5E6B7C',
              lineHeight: 1.5,
              margin: 0,
            }}>
              {t('card.empty_hint', 'Go to Settings \u2192 Connections to get started.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

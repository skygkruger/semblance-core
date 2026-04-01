import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, ProgressBar, FeatureGate } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { PageContainer } from '../components/PageContainer';
import { SectionDivider } from '../components/SectionDivider';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import { ShimmerDescription } from '../components/ShimmerDescription';
import { getLatestDigest, listDigests, generateDigest, getDailyDigest, dismissDailyDigest } from '../ipc/commands';
import { DailyDigestCard } from '../components/DailyDigestCard';
import { useLicense } from '../contexts/LicenseContext';
import type { DailyDigestResult } from '../ipc/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DigestHighlight {
  type: 'subscription_savings' | 'time_saved_milestone' | 'autonomy_accuracy' | 'notable_action';
  title: string;
  description: string;
  impact: string;
}

interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  totalActions: number;
  actionsByType: Record<string, number>;
  totalTimeSavedSeconds: number;
  timeSavedFormatted: string;
  emailsProcessed: number;
  emailsArchived: number;
  emailsDrafted: number;
  emailsSent: number;
  conflictsDetected: number;
  conflictsResolved: number;
  meetingPrepsGenerated: number;
  subscriptionsAnalyzed: number;
  forgottenSubscriptions: number;
  potentialSavings: number;
  followUpReminders: number;
  deadlineAlerts: number;
  actionsAutoExecuted: number;
  actionsApproved: number;
  actionsRejected: number;
  autonomyAccuracy: number;
  narrative: string;
  highlights: DigestHighlight[];
}

interface DigestSummary {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  timeSavedFormatted: string;
  generatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDateRange(start: string, end: string): string {
  if (!start || !end) return 'Date unavailable';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 'Date unavailable';
  return `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })}–${e.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}


// ─── Component ──────────────────────────────────────────────────────────────

export function DigestScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [pastDigests, setPastDigests] = useState<DigestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyDigest, setDailyDigest] = useState<DailyDigestResult | null>(null);

  const loadDigest = useCallback(async () => {
    setLoading(true);
    try {
      const [latest, list] = await Promise.allSettled([
        getLatestDigest(),
        listDigests(),
      ]);
      if (latest.status === 'fulfilled' && latest.value) setDigest(latest.value as unknown as WeeklyDigest);
      if (list.status === 'fulfilled' && Array.isArray(list.value)) setPastDigests(list.value as unknown as DigestSummary[]);
    } catch (err) {
      console.error('[DigestScreen] load digest failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDigest();
    getDailyDigest().then(setDailyDigest).catch(() => {});
  }, [loadDigest]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const weekEnd = now.toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = await generateDigest(weekStart, weekEnd);
      setDigest(result as unknown as WeeklyDigest);
      loadDigest();
    } catch (err) {
      console.error('[DigestScreen] generate failed:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!license.isPremium) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
        <FeatureGate feature="representative-dashboard" isPremium={false} onLearnMore={() => license.openCheckout?.('monthly')} />
      </div>
    );
  }

  if (loading && !digest) {
    return (
      <div className="h-full flex items-center justify-center">
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em' }}>
          {t('screen.digest.loading')}
        </p>
      </div>
    );
  }

  if (!digest) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <ContentBracket>
          <h1 className="page-title" style={{ fontSize: 28 }}>
            {t('screen.digest.title')}
          </h1>
          <ShimmerDescription text="Your weekly intelligence summary" />
            <PageContainer>
              <FeatureStatusBanner title="WEEKLY DIGEST" statusLabel="NO DATA" status="waiting" />
              <EmptyFeatureState
                message={t('screen.digest.empty')}
                actionLabel={t('screen.digest.btn_generate')}
                onAction={handleGenerate}
              />
            </PageContainer>
          </ContentBracket>
        </div>
      </div>
    );
  }

  const autoExec = digest.actionsAutoExecuted ?? 0;
  const approved = digest.actionsApproved ?? 0;
  const rejected = digest.actionsRejected ?? 0;
  const totalAutonomy = autoExec + approved + rejected;
  const maxActions = Math.max(
    digest.emailsArchived + digest.emailsDrafted + digest.emailsSent,
    digest.meetingPrepsGenerated + digest.conflictsResolved,
    1,
  );

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <h1 className="page-title" style={{ fontSize: 28 }}>
          {t('screen.digest.title')} · {formatDateRange(digest.weekStart, digest.weekEnd)}
        </h1>
        <ShimmerDescription text="Your weekly intelligence summary" />
        <PageContainer>
        {/* Daily Digest */}
        {dailyDigest && (
          <DailyDigestCard
            digest={dailyDigest}
            onDismiss={async (id) => {
              await dismissDailyDigest(id).catch(() => {});
              setDailyDigest(null);
            }}
          />
        )}

        {/* Narrative */}
        {digest.narrative && (
          <>
            <FeatureStatusBanner title="NARRATIVE" statusLabel="THIS WEEK" status="active" />
            <div style={{ padding: 16, borderRadius: 8, background: 'rgba(255,255,255,0.02)', marginBottom: 8 }}>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontStyle: 'italic', color: '#EEF1F4', letterSpacing: '0.04em', lineHeight: 1.6, margin: 0 }}>
                &ldquo;{digest.narrative}&rdquo;
              </p>
            </div>
          </>
        )}

        {/* Highlights */}
        {(digest.highlights ?? []).length > 0 && (
          <>
            <SectionDivider />
            <FeatureStatusBanner title="HIGHLIGHTS" statusLabel={`${(digest.highlights ?? []).length} ITEMS`} status="active" />
            <div className="grid grid-cols-3 gap-3">
              {(digest.highlights ?? []).map((hl, i) => (
                <Card key={i} className="p-4 text-center surface-void opal-wireframe">
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 400, color: '#6ECFA3' }}>
                    {hl.impact}
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', marginTop: 4 }}>
                    {hl.title}
                  </p>
                </Card>
              ))}
            </div>
          </>
        )}

        <SectionDivider />

        {/* Actions Breakdown */}
        <FeatureStatusBanner title="ACTIONS BREAKDOWN" statusLabel={`${digest.totalActions} ACTIONS`} status="active" />
        <div className="space-y-4">
          {/* Email */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>{t('screen.digest.breakdown_email')}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                {t('screen.digest.breakdown_email_detail', { archived: digest.emailsArchived, drafted: digest.emailsDrafted, sent: digest.emailsSent })}
              </span>
            </div>
            <ProgressBar value={digest.emailsArchived + digest.emailsDrafted + digest.emailsSent} max={maxActions} />
          </div>

          {/* Calendar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>{t('screen.digest.breakdown_calendar')}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                {t('screen.digest.breakdown_calendar_detail', { preps: digest.meetingPrepsGenerated, resolved: digest.conflictsResolved })}
              </span>
            </div>
            <ProgressBar value={digest.meetingPrepsGenerated + digest.conflictsResolved} max={maxActions} />
          </div>

          {/* Subscriptions */}
          {digest.subscriptionsAnalyzed > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>{t('screen.digest.breakdown_subscriptions')}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                  {t('screen.digest.breakdown_subs_detail', { forgotten: digest.forgottenSubscriptions ?? 0, savings: (digest.potentialSavings ?? 0).toFixed(0) })}
                </span>
              </div>
              <ProgressBar value={digest.forgottenSubscriptions} max={digest.subscriptionsAnalyzed} />
            </div>
          )}
        </div>

        <SectionDivider />

        {/* Autonomy Health */}
        <FeatureStatusBanner title="AUTONOMY HEALTH" statusLabel={`${Math.round(digest.autonomyAccuracy * 100)}% ACCURACY`} status={digest.autonomyAccuracy > 0.8 ? 'active' : 'waiting'} />
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>
              {t('screen.digest.autonomy_accuracy', { percent: Math.round(digest.autonomyAccuracy * 100) })}
            </p>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', marginTop: 2 }}>
              {t('screen.digest.autonomy_detail', { auto: autoExec, approved, total: totalAutonomy })}
            </p>
          </div>
          {rejected === 0 && totalAutonomy > 0 && (
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, padding: '4px 8px', borderRadius: 4, background: 'rgba(110, 207, 163, 0.1)', color: '#6ECFA3', letterSpacing: '0.04em' }}>
              {t('screen.digest.zero_rejected')}
            </span>
          )}
        </div>

        {/* Past Digests */}
        {pastDigests.length > 1 && (
          <>
            <SectionDivider />
            <FeatureStatusBanner title="PAST DIGESTS" statusLabel={`${pastDigests.length - 1} PREVIOUS`} status="active" />
            <div className="space-y-2">
              {pastDigests.slice(1, 5).map(pd => (
                <div
                  key={pd.id}
                  className="flex items-center justify-between py-2 border-b last:border-b-0 border-semblance-border/50 dark:border-semblance-border-dark/50"
                >
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#EEF1F4', letterSpacing: '0.04em' }}>
                    {formatDateRange(pd.weekStart, pd.weekEnd)}
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>
                    {t('screen.digest.past_summary', { count: pd.totalActions, time: pd.timeSavedFormatted })}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        </PageContainer>
        </ContentBracket>
      </div>
    </div>
  );
}

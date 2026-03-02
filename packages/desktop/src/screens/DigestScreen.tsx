import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@semblance/ui';
import { getLatestDigest, listDigests, generateDigest } from '../ipc/commands';

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
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })}–${e.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`h-2 rounded-full bg-semblance-surface-2 dark:bg-semblance-surface-2-dark overflow-hidden ${className ?? ''}`}>
      <div
        className="h-full rounded-full bg-semblance-primary transition-all duration-normal"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DigestScreen() {
  const { t } = useTranslation();
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [pastDigests, setPastDigests] = useState<DigestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDigest = useCallback(async () => {
    setLoading(true);
    try {
      const [latest, list] = await Promise.allSettled([
        getLatestDigest(),
        listDigests(),
      ]);
      if (latest.status === 'fulfilled' && latest.value) setDigest(latest.value as unknown as WeeklyDigest);
      if (list.status === 'fulfilled') setPastDigests(list.value as unknown as DigestSummary[]);
    } catch {
      // Sidecar not wired
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDigest();
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
    } catch {
      // Error
    } finally {
      setLoading(false);
    }
  };

  if (loading && !digest) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          {t('screen.digest.loading')}
        </p>
      </div>
    );
  }

  if (!digest) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-container-lg mx-auto px-6 py-8">
          <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-6">
            {t('screen.digest.title')}
          </h1>
          <Card className="p-8 text-center">
            <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-4">
              {t('screen.digest.empty')}
            </p>
            <Button onClick={handleGenerate}>
              {t('screen.digest.btn_generate')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const totalAutonomy = digest.actionsAutoExecuted + digest.actionsApproved + digest.actionsRejected;
  const maxActions = Math.max(
    digest.emailsArchived + digest.emailsDrafted + digest.emailsSent,
    digest.meetingPrepsGenerated + digest.conflictsResolved,
    1,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
          {t('screen.digest.title')} · {formatDateRange(digest.weekStart, digest.weekEnd)}
        </h1>

        {/* Narrative */}
        {digest.narrative && (
          <Card className="p-4 border border-semblance-border dark:border-semblance-border-dark">
            <p className="text-sm italic text-semblance-text-primary dark:text-semblance-text-primary-dark leading-relaxed">
              &ldquo;{digest.narrative}&rdquo;
            </p>
          </Card>
        )}

        {/* Highlights */}
        {digest.highlights.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {digest.highlights.map((hl, i) => (
              <Card key={i} className="p-4 text-center">
                <p className="text-lg font-semibold text-semblance-primary">
                  {hl.impact}
                </p>
                <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1">
                  {hl.title}
                </p>
              </Card>
            ))}
          </div>
        )}

        {/* Actions Breakdown */}
        <Card className="p-4">
          <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
            {t('screen.digest.section_breakdown')}
          </h2>
          <div className="space-y-4">
            {/* Email */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">{t('screen.digest.breakdown_email')}</span>
                <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  {t('screen.digest.breakdown_email_detail', { archived: digest.emailsArchived, drafted: digest.emailsDrafted, sent: digest.emailsSent })}
                </span>
              </div>
              <ProgressBar value={digest.emailsArchived + digest.emailsDrafted + digest.emailsSent} max={maxActions} />
            </div>

            {/* Calendar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">{t('screen.digest.breakdown_calendar')}</span>
                <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  {t('screen.digest.breakdown_calendar_detail', { preps: digest.meetingPrepsGenerated, resolved: digest.conflictsResolved })}
                </span>
              </div>
              <ProgressBar value={digest.meetingPrepsGenerated + digest.conflictsResolved} max={maxActions} />
            </div>

            {/* Subscriptions */}
            {digest.subscriptionsAnalyzed > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">{t('screen.digest.breakdown_subscriptions')}</span>
                  <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                    {t('screen.digest.breakdown_subs_detail', { forgotten: digest.forgottenSubscriptions, savings: digest.potentialSavings.toFixed(0) })}
                  </span>
                </div>
                <ProgressBar value={digest.forgottenSubscriptions} max={digest.subscriptionsAnalyzed} />
              </div>
            )}
          </div>
        </Card>

        {/* Autonomy Health */}
        <Card className="p-4">
          <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
            {t('screen.digest.section_autonomy')}
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
                {t('screen.digest.autonomy_accuracy', { percent: Math.round(digest.autonomyAccuracy * 100) })}
              </p>
              <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-0.5">
                {t('screen.digest.autonomy_detail', { auto: digest.actionsAutoExecuted, approved: digest.actionsApproved, total: totalAutonomy })}
              </p>
            </div>
            {digest.actionsRejected === 0 && totalAutonomy > 0 && (
              <span className="text-xs px-2 py-1 rounded bg-semblance-success/10 text-semblance-success">
                {t('screen.digest.zero_rejected')}
              </span>
            )}
          </div>
        </Card>

        {/* Past Digests */}
        {pastDigests.length > 1 && (
          <Card className="p-4">
            <h2 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-3">
              {t('screen.digest.section_past')}
            </h2>
            <div className="space-y-2">
              {pastDigests.slice(1, 5).map(pd => (
                <div
                  key={pd.id}
                  className="flex items-center justify-between py-2 border-b last:border-b-0 border-semblance-border/50 dark:border-semblance-border-dark/50"
                >
                  <span className="text-xs text-semblance-text-primary dark:text-semblance-text-primary-dark">
                    {formatDateRange(pd.weekStart, pd.weekEnd)}
                  </span>
                  <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                    {t('screen.digest.past_summary', { count: pd.totalActions, time: pd.timeSavedFormatted })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * AdversarialDashboardScreen — Dark pattern defense dashboard.
 * Shows alerts, manipulation reframes, subscription value-to-cost assessments, opt-out status.
 * Thin IPC wrapper rendering with Design Bible CSS tokens.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getDarkPatternFlags, dismissDarkPatternFlag, getFinancialDashboard, prefGet } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';
import { Card, SkeletonCard, FeatureGate } from '@semblance/ui';
import { DarkPatternBadge } from '../components/DarkPatternBadge';
import type { DarkPatternFlag } from '../components/DarkPatternBadge';
import './AdversarialDashboardScreen.css';

interface SubscriptionAssessment {
  id: string;
  name: string;
  monthlyCost: number;
  valueScore: number;
  recommendation: string;
}

interface OptOutStatus {
  totalOptOuts: number;
  pendingOptOuts: number;
  successRate: number;
}

const STORAGE_KEY_OPT_OUT = 'semblance.adversarial.opt_out_status';

const DEFAULT_OPT_OUT: OptOutStatus = { totalOptOuts: 0, pendingOptOuts: 0, successRate: 0 };

export function AdversarialDashboardScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<DarkPatternFlag[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionAssessment[]>([]);
  const [optOutStatus, setOptOutStatus] = useState<OptOutStatus>(DEFAULT_OPT_OUT);

  useEffect(() => {
    async function loadData() {
      try {
        // Load opt-out status from SQLite prefs
        try {
          const raw = await prefGet(STORAGE_KEY_OPT_OUT);
          if (raw) setOptOutStatus(JSON.parse(raw) as OptOutStatus);
        } catch { /* ignore */ }

        // Load dark pattern flags from IPC
        const loadedFlags = await getDarkPatternFlags().catch((err) => {
          console.error('[AdversarialDashboard] Failed to load dark pattern flags:', err);
          return [];
        });
        setFlags(loadedFlags);

        // Load subscription data from financial dashboard for value assessments
        const financialData = await getFinancialDashboard('30d').catch((err) => {
          console.error('[AdversarialDashboard] Failed to load financial data:', err);
          return null;
        });

        if (financialData?.subscriptions?.charges) {
          const mappedSubs: SubscriptionAssessment[] = financialData.subscriptions.charges.map((charge) => ({
            id: charge.id,
            name: charge.merchantName,
            monthlyCost: charge.amount,
            valueScore: Math.min(100, Math.round((charge.estimatedAnnualCost ?? charge.amount * 12) / 10)),
            recommendation: charge.status === 'cancelled'
              ? 'Cancelled'
              : charge.status === 'forgotten'
                ? 'Potentially forgotten — review'
                : 'Active',
          }));
          setSubscriptions(mappedSubs);
        }
      } catch (err) {
        console.error('[AdversarialDashboard] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <FeatureGate feature="dark-pattern-detection" isPremium={license.isPremium}>
      <div className="adversarial-dashboard h-full overflow-y-auto">
        <div className="adversarial-dashboard__container">
          <h1 className="adversarial-dashboard__title">{t('screen.adversarial.title')}</h1>
          <p className="adversarial-dashboard__subtitle">
            {t('screen.adversarial.subtitle')}
          </p>

          {loading && (
            <SkeletonCard
              variant="generic"
              message="Loading Adversarial Shield"
              subMessage="Scanning for dark patterns"
              showSpinner
            />
          )}

          {!loading && (
            <>
              {/* Opt-out stats */}
              <div className="adversarial-dashboard__stats">
                <Card className="adversarial-dashboard__stat">
                  <p className="adversarial-dashboard__stat-value">{optOutStatus.totalOptOuts}</p>
                  <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.total_opt_outs')}</p>
                </Card>
                <Card className="adversarial-dashboard__stat">
                  <p className="adversarial-dashboard__stat-value">{optOutStatus.pendingOptOuts}</p>
                  <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.pending')}</p>
                </Card>
                <Card className="adversarial-dashboard__stat">
                  <p className="adversarial-dashboard__stat-value">
                    {optOutStatus.successRate > 0 ? `${optOutStatus.successRate}%` : '\u2014'}
                  </p>
                  <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.success_rate')}</p>
                </Card>
              </div>

              {/* Dark pattern alerts */}
              <div className="adversarial-dashboard__card">
                <h2 className="adversarial-dashboard__section-title">{t('screen.adversarial.dark_pattern_alerts')}</h2>
                {flags.length === 0 ? (
                  <p className="adversarial-dashboard__empty">
                    {t('screen.adversarial.no_threats')}
                  </p>
                ) : (
                  <div className="adversarial-dashboard__alert-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {flags.map((flag) => (
                      <DarkPatternBadge
                        key={flag.contentId}
                        flag={flag}
                        onDismiss={(contentId) => {
                          dismissDarkPatternFlag(contentId).catch((err) =>
                            console.error('[AdversarialDashboard] Failed to dismiss flag:', err)
                          );
                          setFlags((prev) => prev.filter((f) => f.contentId !== contentId));
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Subscription assessments */}
              <Card className="adversarial-dashboard__card">
                <h2 className="adversarial-dashboard__section-title">{t('screen.adversarial.subscription_value')}</h2>
                {subscriptions.length === 0 ? (
                  <p className="adversarial-dashboard__empty">
                    {t('screen.adversarial.no_subscriptions')}
                  </p>
                ) : (
                  <div className="adversarial-dashboard__subscription-list">
                    {subscriptions.map((sub) => (
                      <div key={sub.id} className="adversarial-dashboard__subscription-item">
                        <span className="adversarial-dashboard__subscription-name">{sub.name}</span>
                        <span className="adversarial-dashboard__subscription-cost">
                          ${sub.monthlyCost.toFixed(2)}/mo
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </FeatureGate>
  );
}

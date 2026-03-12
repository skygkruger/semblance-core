/**
 * AdversarialDashboardScreen — Dark pattern defense dashboard.
 * Shows alerts, manipulation reframes, subscription value-to-cost assessments, opt-out status.
 * Thin IPC wrapper rendering with Design Bible CSS tokens.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getDarkPatternFlags, getFinancialDashboard } from '../ipc/commands';
import './AdversarialDashboardScreen.css';

interface DarkPatternAlert {
  id: string;
  severity: 'critical' | 'warning';
  source: string;
  description: string;
  detectedAt: string;
}

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

function loadOptOutStatus(): OptOutStatus {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPT_OUT);
    if (raw) return JSON.parse(raw) as OptOutStatus;
  } catch { /* ignore */ }
  return { totalOptOuts: 0, pendingOptOuts: 0, successRate: 0 };
}

export function AdversarialDashboardScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<DarkPatternAlert[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionAssessment[]>([]);
  const [optOutStatus] = useState<OptOutStatus>(loadOptOutStatus);

  useEffect(() => {
    async function loadData() {
      try {
        // Load dark pattern flags from IPC
        const flags = await getDarkPatternFlags().catch((err) => {
          console.error('[AdversarialDashboard] Failed to load dark pattern flags:', err);
          return [];
        });

        // Map dark pattern results to alert format
        const mappedAlerts: DarkPatternAlert[] = flags.map((flag) => ({
          id: flag.contentId,
          severity: flag.confidence >= 0.8 ? 'critical' as const : 'warning' as const,
          source: (flag.patterns.length > 0 ? flag.patterns[0]?.category : undefined) ?? 'unknown',
          description: flag.reframe,
          detectedAt: new Date().toISOString(),
        }));
        setAlerts(mappedAlerts);

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
            valueScore: charge.confidence,
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
    <div className="adversarial-dashboard h-full overflow-y-auto">
      <div className="adversarial-dashboard__container">
        <h1 className="adversarial-dashboard__title">{t('screen.adversarial.title')}</h1>
        <p className="adversarial-dashboard__subtitle">
          {t('screen.adversarial.subtitle')}
        </p>

        {loading && (
          <p className="adversarial-dashboard__empty">{t('common.loading', 'Loading...')}</p>
        )}

        {/* Opt-out stats */}
        <div className="adversarial-dashboard__stats">
          <div className="adversarial-dashboard__stat">
            <p className="adversarial-dashboard__stat-value">{optOutStatus.totalOptOuts}</p>
            <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.total_opt_outs')}</p>
          </div>
          <div className="adversarial-dashboard__stat">
            <p className="adversarial-dashboard__stat-value">{optOutStatus.pendingOptOuts}</p>
            <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.pending')}</p>
          </div>
          <div className="adversarial-dashboard__stat">
            <p className="adversarial-dashboard__stat-value">
              {optOutStatus.successRate > 0 ? `${optOutStatus.successRate}%` : '—'}
            </p>
            <p className="adversarial-dashboard__stat-label">{t('screen.adversarial.success_rate')}</p>
          </div>
        </div>

        {/* Dark pattern alerts */}
        <div className="adversarial-dashboard__card surface-void opal-wireframe">
          <h2 className="adversarial-dashboard__section-title">{t('screen.adversarial.dark_pattern_alerts')}</h2>
          {alerts.length === 0 ? (
            <p className="adversarial-dashboard__empty">
              {t('screen.adversarial.no_threats')}
            </p>
          ) : (
            <ul className="adversarial-dashboard__alert-list">
              {alerts.map((alert) => (
                <li key={alert.id} className="adversarial-dashboard__alert-item">
                  <span
                    className={`adversarial-dashboard__alert-severity adversarial-dashboard__alert-severity--${alert.severity}`}
                  />
                  <span className="adversarial-dashboard__alert-text">
                    {alert.source}: {alert.description}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Subscription assessments */}
        <div className="adversarial-dashboard__card surface-void opal-wireframe">
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
        </div>
      </div>
    </div>
  );
}

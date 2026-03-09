/**
 * AdversarialDashboardScreen — Dark pattern defense dashboard.
 * Shows alerts, manipulation reframes, subscription value-to-cost assessments, opt-out status.
 * Thin IPC wrapper rendering with Design Bible CSS tokens.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export function AdversarialDashboardScreen() {
  const { t } = useTranslation();
  const [alerts] = useState<DarkPatternAlert[]>([]);
  const [subscriptions] = useState<SubscriptionAssessment[]>([]);
  const [optOutStatus] = useState<OptOutStatus>({
    totalOptOuts: 0,
    pendingOptOuts: 0,
    successRate: 0,
  });

  return (
    <div className="adversarial-dashboard h-full overflow-y-auto">
      <div className="adversarial-dashboard__container">
        <h1 className="adversarial-dashboard__title">{t('screen.adversarial.title')}</h1>
        <p className="adversarial-dashboard__subtitle">
          {t('screen.adversarial.subtitle')}
        </p>

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

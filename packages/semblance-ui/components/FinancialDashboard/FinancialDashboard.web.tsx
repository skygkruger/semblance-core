import { PeriodSelector } from '../Charts/PeriodSelector.web';
import { SpendingOverviewSection } from './SpendingOverviewSection.web';
import { CategoryBreakdownSection } from './CategoryBreakdownSection.web';
import { AnomalyCard } from './AnomalyCard.web';
import type { FinancialDashboardProps } from './FinancialDashboard.types';
import './FinancialDashboard.css';

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
};

export function FinancialDashboard({
  overview,
  categories,
  anomalies,
  subscriptions,
  selectedPeriod,
  onPeriodChange,
  onDismissAnomaly,
  onCancelSubscription,
  onKeepSubscription,
  onImportStatement,
  loading,
}: FinancialDashboardProps) {
  if (loading) {
    return (
      <div className="fin-dash">
        <div className="fin-dash__header">
          <h2 className="fin-dash__title">Financial Overview</h2>
        </div>
        <div className="fin-dash__skeleton">
          <div className="fin-dash__skeleton-bar fin-dash__skeleton-bar--wide" />
          <div className="fin-dash__skeleton-bar fin-dash__skeleton-bar--tall" />
          <div className="fin-dash__skeleton-bar fin-dash__skeleton-bar--medium" />
          <div className="fin-dash__skeleton-bar fin-dash__skeleton-bar--narrow" />
        </div>
      </div>
    );
  }

  if (!overview && categories.length === 0) {
    return (
      <div className="fin-dash">
        <div className="fin-dash__empty">
          <h2 className="fin-dash__empty-title">No Financial Data Yet</h2>
          <p className="fin-dash__empty-text">
            Import a bank or credit card statement to get started. Semblance will detect
            recurring charges, categorize spending, and flag anomalies — all locally on your device.
          </p>
          <button type="button" className="fin-dash__import-btn" onClick={onImportStatement}>
            Import Statement
          </button>
        </div>
      </div>
    );
  }

  const forgottenCharges = subscriptions.charges.filter((c) => c.status === 'forgotten');
  const activeCharges = subscriptions.charges.filter((c) => c.status !== 'forgotten' && c.status !== 'cancelled');

  return (
    <div className="fin-dash">
      <div className="fin-dash__header">
        <div>
          <h2 className="fin-dash__title">Financial Overview</h2>
          <p className="fin-dash__subtitle">Your spending patterns, locally analyzed</p>
        </div>
        <PeriodSelector selected={selectedPeriod} onSelect={onPeriodChange} />
      </div>

      {overview && <SpendingOverviewSection overview={overview} />}

      <CategoryBreakdownSection categories={categories} />

      {anomalies.length > 0 && (
        <div className="fin-dash__section">
          <h3 className="fin-dash__section-title">
            Anomalies ({anomalies.length})
          </h3>
          <div className="fin-dash__anomalies">
            {anomalies.map((a) => (
              <AnomalyCard key={a.id} anomaly={a} onDismiss={onDismissAnomaly} />
            ))}
          </div>
        </div>
      )}

      {subscriptions.charges.length > 0 && (
        <div className="fin-dash__section">
          <h3 className="fin-dash__section-title">
            Subscriptions ({subscriptions.summary.activeCount} active)
          </h3>
          <div className="fin-dash__overview">
            <div className="fin-dash__overview-row">
              <span className="fin-dash__daily-avg">
                {formatCurrency(subscriptions.summary.totalMonthly)}/mo
              </span>
              <span className="fin-dash__meta">
                &middot; {formatCurrency(subscriptions.summary.totalAnnual)}/yr
              </span>
            </div>
          </div>

          {forgottenCharges.length > 0 && (
            <div className="fin-dash__section">
              <h4 className="fin-dash__section-title" style={{ color: '#C97B6E' }}>
                Potentially Forgotten ({forgottenCharges.length})
              </h4>
              {forgottenCharges.map((charge) => (
                <div key={charge.id} className="anomaly-card anomaly-card--medium">
                  <div className="anomaly-card__header">
                    <h4 className="anomaly-card__title">{charge.merchantName}</h4>
                    <span className="anomaly-card__amount">
                      {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
                    </span>
                  </div>
                  <p className="anomaly-card__description">
                    Last charged {charge.lastChargeDate} &middot; {formatCurrency(charge.estimatedAnnualCost)}/yr
                  </p>
                  <div className="anomaly-card__footer">
                    <span className="anomaly-card__merchant">
                      Confidence: {Math.round(charge.confidence * 100)}%
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="anomaly-card__dismiss"
                        onClick={() => onCancelSubscription(charge.id)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="anomaly-card__dismiss"
                        onClick={() => onKeepSubscription(charge.id)}
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeCharges.length > 0 && (
            <div className="fin-dash__section">
              {activeCharges.map((charge) => (
                <div key={charge.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontFamily: 'var(--fb)', fontSize: '13px', color: '#CDD4DB' }}>
                    {charge.merchantName}
                  </span>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: '13px', color: '#A8B4C0' }}>
                    {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {subscriptions.summary.potentialSavings > 0 && (
            <p style={{ fontFamily: 'var(--fm)', fontSize: '13px', color: '#6ECFA3', margin: 0 }}>
              Potential savings: {formatCurrency(subscriptions.summary.potentialSavings)}/yr
            </p>
          )}
        </div>
      )}

      <div className="fin-dash__import">
        <p className="fin-dash__import-text">Import another statement to expand your financial picture</p>
        <button type="button" className="fin-dash__import-btn" onClick={onImportStatement}>
          Import Statement
        </button>
      </div>
    </div>
  );
}

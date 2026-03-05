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
      <div className="fin-dash surface-void opal-wireframe" data-identity="financial">

        <div className="fin-dash__loading">Generating financial overview...</div>
      </div>
    );
  }

  if (!overview && categories.length === 0) {
    return (
      <div className="fin-dash surface-void opal-wireframe" data-identity="financial">

        <div className="fin-dash__empty">
          <h2 className="fin-dash__empty-title">No Financial Data Yet</h2>
          <p className="fin-dash__empty-text">
            Import a bank or credit card statement to get started. Semblance will detect
            recurring charges, categorize spending, and flag anomalies — all locally on your device.
          </p>
          <button type="button" className="btn btn--opal btn--sm fin-dash__import-btn" onClick={onImportStatement}>
            <span className="btn__text">Import Statement</span>
          </button>
        </div>
      </div>
    );
  }

  const forgottenCharges = subscriptions.charges.filter((c) => c.status === 'forgotten');
  const activeCharges = subscriptions.charges.filter((c) => c.status !== 'forgotten' && c.status !== 'cancelled');

  return (
    <div className="fin-dash surface-void opal-wireframe" data-identity="financial">
      {/* Header — centered, shimmer title */}
      <div className="fin-dash__header">
        <h2 className="fin-dash__title">Financial Overview</h2>
        <span className="fin-dash__subtitle">Your spending patterns, locally analyzed</span>
        <div className="fin-dash__period-wrap">
          <PeriodSelector selected={selectedPeriod} onSelect={onPeriodChange} />
        </div>
      </div>

      <div className="fin-dash__divider" />

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

          <div className="fin-dash__row">
            <span className="fin-dash__row-label">Monthly total</span>
            <span className="fin-dash__row-value">{formatCurrency(subscriptions.summary.totalMonthly)}/mo</span>
          </div>
          <div className="fin-dash__row">
            <span className="fin-dash__row-label">Annual total</span>
            <span className="fin-dash__row-value">{formatCurrency(subscriptions.summary.totalAnnual)}/yr</span>
          </div>

          {forgottenCharges.length > 0 && (
            <div className="fin-dash__section">
              <h4 className="fin-dash__section-title fin-dash__section-title--critical">
                Potentially Forgotten ({forgottenCharges.length})
              </h4>
              {forgottenCharges.map((charge) => (
                <div key={charge.id} className="fin-dash__row fin-dash__row--forgotten">
                  <span className="fin-dash__row-label">{charge.merchantName}</span>
                  <span className="fin-dash__row-value">
                    {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
                  </span>
                  <div className="fin-dash__row-actions">
                    <button
                      type="button"
                      className="fin-dash__ghost-btn"
                      onClick={() => onCancelSubscription(charge.id)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="fin-dash__ghost-btn"
                      onClick={() => onKeepSubscription(charge.id)}
                    >
                      Keep
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeCharges.map((charge) => (
            <div key={charge.id} className="fin-dash__row">
              <span className="fin-dash__row-label">{charge.merchantName}</span>
              <span className="fin-dash__row-value">
                {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
              </span>
            </div>
          ))}

          {subscriptions.summary.potentialSavings > 0 && (
            <div className="fin-dash__savings">
              <span className="fin-dash__savings-label">Potential savings:</span>{' '}
              <span className="fin-dash__savings-amount">{formatCurrency(subscriptions.summary.potentialSavings)}/yr</span>
            </div>
          )}
        </div>
      )}

      {/* Import — opal-sweep button */}
      <div className="fin-dash__import">
        <p className="fin-dash__import-text">Import another statement to expand your financial picture</p>
        <button type="button" className="btn btn--opal btn--sm fin-dash__import-btn" onClick={onImportStatement}>
          <span className="btn__text">Import Statement</span>
        </button>
      </div>
    </div>
  );
}

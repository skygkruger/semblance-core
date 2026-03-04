import { useState } from 'react';
import { Card } from '@semblance/ui';
import { updateSubscriptionStatus } from '../ipc/commands';
import './SubscriptionInsightCard.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecurringCharge {
  id: string;
  merchantName: string;
  amount: number;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  confidence: number;
  lastChargeDate: string;
  chargeCount: number;
  estimatedAnnualCost: number;
  status: 'active' | 'forgotten' | 'cancelled' | 'user_confirmed';
}

interface SubscriptionSummary {
  totalMonthly: number;
  totalAnnual: number;
  activeCount: number;
  forgottenCount: number;
  potentialSavings: number;
}

interface SubscriptionInsightCardProps {
  charges: RecurringCharge[];
  summary: SubscriptionSummary;
  onDismiss: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
};

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

function getStatusClass(charge: RecurringCharge): string {
  if (charge.status === 'forgotten') return 'sub-insight__status-dot--forgotten';
  if (charge.confidence < 0.5) return 'sub-insight__status-dot--uncertain';
  return 'sub-insight__status-dot--active';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SubscriptionInsightCard({ charges, summary, onDismiss }: SubscriptionInsightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const forgottenCharges = charges.filter(c => c.status === 'forgotten');
  const allCharges = charges;

  const handleUpdateStatus = async (chargeId: string, status: string) => {
    setProcessingId(chargeId);
    try {
      await updateSubscriptionStatus(chargeId, status);
    } catch {
      // Sidecar not wired
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card className="sub-insight">
      <div className="sub-insight__header">
        <div>
          <h3 className="sub-insight__title">Subscription Analysis</h3>
          <p className="sub-insight__subtitle">
            Found {summary.activeCount} recurring charge{summary.activeCount !== 1 ? 's' : ''}
            {' \u00B7 '}
            {formatCurrency(summary.totalMonthly)}/month
            {' \u00B7 '}
            {formatCurrency(summary.totalAnnual)}/year
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="sub-insight__dismiss-btn">
          Dismiss
        </button>
      </div>

      {forgottenCharges.length > 0 && (
        <div>
          <p className="sub-insight__forgotten-label">
            {forgottenCharges.length} potentially forgotten:
          </p>
          <div className="sub-insight__charges">
            {forgottenCharges.map(charge => (
              <div key={charge.id} className="sub-insight__charge">
                <div className="sub-insight__charge-header">
                  <div className="sub-insight__charge-name-row">
                    <span className={`sub-insight__status-dot ${getStatusClass(charge)}`} />
                    <span className="sub-insight__charge-name">{charge.merchantName}</span>
                  </div>
                  <div className="sub-insight__charge-amount">
                    <span className="sub-insight__amount">{formatCurrency(charge.amount)}</span>
                    <span className="sub-insight__freq">{FREQ_LABELS[charge.frequency] ?? '/mo'}</span>
                    <span className="sub-insight__freq">({formatCurrency(charge.estimatedAnnualCost)}/yr)</span>
                  </div>
                </div>
                <p className="sub-insight__charge-detail">
                  No email contact found &middot; Last charged {charge.lastChargeDate}
                </p>
                <div className="sub-insight__charge-actions">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(charge.id, 'cancelled')}
                    disabled={processingId === charge.id}
                    className="sub-insight__cancel-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(charge.id, 'user_confirmed')}
                    disabled={processingId === charge.id}
                    className="sub-insight__keep-btn"
                  >
                    Keep
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.potentialSavings > 0 && (
        <p className="sub-insight__savings">
          Total potential savings: {formatCurrency(summary.potentialSavings)}/year
        </p>
      )}

      {!expanded && allCharges.length > forgottenCharges.length && (
        <button type="button" onClick={() => setExpanded(true)} className="sub-insight__expand-btn">
          View all {allCharges.length} subscriptions
        </button>
      )}

      {expanded && (
        <div className="sub-insight__all-charges">
          <p className="sub-insight__all-label">All recurring charges</p>
          {allCharges
            .filter(c => c.status !== 'forgotten')
            .map(charge => (
              <div key={charge.id} className="sub-insight__all-row">
                <div className="sub-insight__all-name-row">
                  <span className={`sub-insight__all-dot ${getStatusClass(charge)}`} />
                  <span className="sub-insight__all-name">{charge.merchantName}</span>
                </div>
                <span className="sub-insight__all-amount">
                  {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
                </span>
              </div>
            ))}
          <button type="button" onClick={() => setExpanded(false)} className="sub-insight__expand-btn">
            Collapse
          </button>
        </div>
      )}
    </Card>
  );
}

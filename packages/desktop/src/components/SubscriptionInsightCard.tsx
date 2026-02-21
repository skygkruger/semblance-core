import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card } from '@semblance/ui';

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

function statusIndicator(charge: RecurringCharge): { color: string; label: string } {
  if (charge.status === 'forgotten') return { color: 'bg-semblance-error', label: 'Likely forgotten' };
  if (charge.confidence < 0.5) return { color: 'bg-semblance-attention', label: 'Uncertain' };
  return { color: 'bg-semblance-success', label: 'Active' };
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
      await invoke('update_subscription_status', { chargeId, status });
    } catch {
      // Sidecar not wired
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <Card className="p-4 border-l-[3px] border-l-semblance-attention">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
            Subscription Analysis
          </h3>
          <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-0.5">
            Found {summary.activeCount} recurring charge{summary.activeCount !== 1 ? 's' : ''}
            {' · '}
            {formatCurrency(summary.totalMonthly)}/month
            {' · '}
            {formatCurrency(summary.totalAnnual)}/year
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs px-2 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast"
        >
          Dismiss
        </button>
      </div>

      {/* Forgotten subscriptions */}
      {forgottenCharges.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium text-semblance-attention mb-2">
            {forgottenCharges.length} potentially forgotten:
          </p>
          <div className="space-y-2">
            {forgottenCharges.map(charge => {
              const indicator = statusIndicator(charge);
              return (
                <div
                  key={charge.id}
                  className="p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark border border-semblance-border dark:border-semblance-border-dark"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${indicator.color}`} />
                      <span className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark truncate">
                        {charge.merchantName}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1 flex-shrink-0">
                      <span className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
                        {formatCurrency(charge.amount)}
                      </span>
                      <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                        {FREQ_LABELS[charge.frequency] ?? '/mo'}
                      </span>
                      <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark ml-1">
                        ({formatCurrency(charge.estimatedAnnualCost)}/yr)
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-2">
                    No email contact found · Last charged {charge.lastChargeDate}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(charge.id, 'cancelled')}
                      disabled={processingId === charge.id}
                      className="text-xs px-2.5 py-1 rounded bg-semblance-error/10 text-semblance-error hover:bg-semblance-error/20 transition-colors duration-fast disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(charge.id, 'user_confirmed')}
                      disabled={processingId === charge.id}
                      className="text-xs px-2.5 py-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors duration-fast disabled:opacity-50"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Potential savings */}
      {summary.potentialSavings > 0 && (
        <p className="text-xs font-medium text-semblance-success mb-3">
          Total potential savings: {formatCurrency(summary.potentialSavings)}/year
        </p>
      )}

      {/* Expand to see all */}
      {!expanded && allCharges.length > forgottenCharges.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-semblance-primary hover:underline"
        >
          View all {allCharges.length} subscriptions
        </button>
      )}

      {/* All subscriptions (expanded) */}
      {expanded && (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-2">
            All recurring charges
          </p>
          {allCharges
            .filter(c => c.status !== 'forgotten')
            .map(charge => {
              const indicator = statusIndicator(charge);
              return (
                <div
                  key={charge.id}
                  className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0 border-semblance-border/50 dark:border-semblance-border-dark/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${indicator.color}`} />
                    <span className="text-xs text-semblance-text-primary dark:text-semblance-text-primary-dark truncate">
                      {charge.merchantName}
                    </span>
                  </div>
                  <span className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark flex-shrink-0">
                    {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
                  </span>
                </div>
              );
            })}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-semblance-primary hover:underline mt-1"
          >
            Collapse
          </button>
        </div>
      )}
    </Card>
  );
}

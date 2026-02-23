/**
 * CancellationFlow — Subscription cancellation UI.
 * Lists subscriptions with cancel buttons, shows draft preview with style score,
 * and tracks cancellation status.
 */

import React, { useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CancellableSubscriptionView {
  chargeId: string;
  merchantName: string;
  amount: number;
  frequency: string;
  estimatedAnnualCost: number;
  supportEmail: string | null;
  cancellationUrl: string | null;
  cancellationStatus: 'not-started' | 'draft-ready' | 'sent' | 'confirmed' | 'failed';
}

export interface DraftPreview {
  to: string;
  subject: string;
  body: string;
  styleScore: number | null;
}

export interface CancellationFlowProps {
  subscriptions: CancellableSubscriptionView[];
  activeDraft: DraftPreview | null;
  onInitiateCancellation: (chargeId: string) => void;
  onSendDraft: () => void;
  onDismissDraft: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CancellationFlow({
  subscriptions,
  activeDraft,
  onInitiateCancellation,
  onSendDraft,
  onDismissDraft,
}: CancellationFlowProps) {
  return (
    <div data-testid="cancellation-flow" className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">
        Subscription Cancellation
      </h2>
      <p className="text-sm text-muted-foreground">
        Your Digital Representative can draft and send cancellation emails on your behalf.
      </p>

      {/* Draft Preview */}
      {activeDraft && (
        <div data-testid="draft-preview" className="p-4 border-2 border-accent rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Draft Preview</h3>
            {activeDraft.styleScore !== null && (
              <span className="text-sm text-muted-foreground" data-testid="style-score">
                Style match: {activeDraft.styleScore}/100
              </span>
            )}
          </div>
          <div className="text-sm space-y-1">
            <p><span className="font-medium">To:</span> {activeDraft.to}</p>
            <p><span className="font-medium">Subject:</span> {activeDraft.subject}</p>
          </div>
          <div className="bg-muted/10 p-3 rounded text-sm whitespace-pre-wrap">
            {activeDraft.body}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSendDraft}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              data-testid="send-draft"
            >
              Send
            </button>
            <button
              onClick={onDismissDraft}
              className="px-4 py-2 border rounded hover:bg-accent/20"
              data-testid="dismiss-draft"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Subscription List */}
      <div data-testid="subscription-list" className="space-y-2">
        {subscriptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No cancellable subscriptions found. Import bank statements to detect recurring charges.
          </p>
        ) : (
          subscriptions.map(sub => (
            <div key={sub.chargeId} className="flex items-center gap-3 p-4 border rounded-lg">
              <div className="flex-1">
                <p className="font-medium text-foreground">{sub.merchantName}</p>
                <p className="text-sm text-muted-foreground">
                  ${Math.abs(sub.amount / 100).toFixed(2)}/{sub.frequency}
                  &nbsp;&middot;&nbsp;
                  ${Math.abs(sub.estimatedAnnualCost / 100).toFixed(2)}/year
                </p>
                {sub.supportEmail && (
                  <p className="text-xs text-muted-foreground">
                    Support: {sub.supportEmail}
                  </p>
                )}
              </div>
              <CancellationStatusBadge status={sub.cancellationStatus} />
              {sub.cancellationStatus === 'not-started' && sub.supportEmail && (
                <button
                  onClick={() => onInitiateCancellation(sub.chargeId)}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  data-testid={`cancel-${sub.chargeId}`}
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CancellationStatusBadge({ status }: { status: string }) {
  const labels: Record<string, { text: string; className: string }> = {
    'not-started': { text: 'Active', className: 'bg-gray-100 text-gray-700' },
    'draft-ready': { text: 'Draft Ready', className: 'bg-yellow-100 text-yellow-800' },
    'sent': { text: 'Sent', className: 'bg-blue-100 text-blue-800' },
    'confirmed': { text: 'Cancelled', className: 'bg-green-100 text-green-800' },
    'failed': { text: 'Failed', className: 'bg-red-100 text-red-800' },
  };

  const label = labels[status] ?? { text: status, className: 'bg-gray-100 text-gray-800' };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${label.className}`}>
      {label.text}
    </span>
  );
}

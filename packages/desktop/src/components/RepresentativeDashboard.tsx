/**
 * RepresentativeDashboard — Digital Representative action summary, pending approvals,
 * active follow-ups, and savings tracker.
 * Free tier: "Activate your Digital Representative" prompt.
 * Premium: Full dashboard with action history and approval controls.
 */

import React from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RepresentativeActionSummary {
  id: string;
  subject: string;
  status: 'pending' | 'approved' | 'sent' | 'rejected' | 'failed';
  classification: 'routine' | 'standard' | 'high-stakes';
  createdAt: string;
  estimatedTimeSavedSeconds: number;
}

export interface ActiveFollowUp {
  id: string;
  merchantName: string;
  stage: string;
  nextFollowUpAt: string | null;
}

export interface RepresentativeDashboardProps {
  isPremium: boolean;
  actions: RepresentativeActionSummary[];
  pendingActions: RepresentativeActionSummary[];
  followUps: ActiveFollowUp[];
  totalTimeSavedSeconds: number;
  onApproveAction: (actionId: string) => void;
  onRejectAction: (actionId: string) => void;
  onResolveFollowUp: (followUpId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RepresentativeDashboard({
  isPremium,
  actions,
  pendingActions,
  followUps,
  totalTimeSavedSeconds,
  onApproveAction,
  onRejectAction,
  onResolveFollowUp,
}: RepresentativeDashboardProps) {
  if (!isPremium) {
    return (
      <div data-testid="representative-free-tier" className="p-6 text-center">
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Activate your Digital Representative
        </h2>
        <p className="text-muted-foreground mb-4">
          Your Digital Representative drafts emails in your voice, cancels subscriptions,
          handles customer service, and follows up automatically.
        </p>
        <p className="text-sm text-muted-foreground">
          Available with the Digital Representative tier.
        </p>
      </div>
    );
  }

  const totalMinutesSaved = Math.round(totalTimeSavedSeconds / 60);

  return (
    <div data-testid="representative-dashboard" className="space-y-6">
      {/* Savings Summary */}
      <div className="flex items-center gap-4 p-4 bg-accent/10 rounded-lg">
        <div>
          <p className="text-sm text-muted-foreground">Time saved by your Digital Representative</p>
          <p className="text-2xl font-bold text-foreground" data-testid="time-saved">
            {totalMinutesSaved} minutes
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm text-muted-foreground">Actions completed</p>
          <p className="text-xl font-semibold text-foreground">
            {actions.filter(a => a.status === 'sent').length}
          </p>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingActions.length > 0 && (
        <div data-testid="pending-approvals">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Pending Approvals ({pendingActions.length})
          </h3>
          <div className="space-y-2">
            {pendingActions.map(action => (
              <div key={action.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-foreground">{action.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    {action.classification} &middot; {formatRelativeTime(action.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => onApproveAction(action.id)}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  data-testid={`approve-${action.id}`}
                >
                  Approve
                </button>
                <button
                  onClick={() => onRejectAction(action.id)}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  data-testid={`reject-${action.id}`}
                >
                  Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Follow-Ups */}
      {followUps.length > 0 && (
        <div data-testid="active-follow-ups">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            Active Follow-Ups ({followUps.length})
          </h3>
          <div className="space-y-2">
            {followUps.map(fu => (
              <div key={fu.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-foreground">{fu.merchantName}</p>
                  <p className="text-sm text-muted-foreground">
                    Stage: {fu.stage}
                    {fu.nextFollowUpAt && ` &middot; Next: ${formatRelativeTime(fu.nextFollowUpAt)}`}
                  </p>
                </div>
                <button
                  onClick={() => onResolveFollowUp(fu.id)}
                  className="px-3 py-1 text-sm border rounded hover:bg-accent/20"
                  data-testid={`resolve-${fu.id}`}
                >
                  Mark Resolved
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Actions */}
      <div data-testid="recent-actions">
        <h3 className="text-lg font-semibold text-foreground mb-3">Recent Actions</h3>
        {actions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No actions yet. Your Digital Representative will start working when you ask it to.</p>
        ) : (
          <div className="space-y-2">
            {actions.slice(0, 10).map(action => (
              <div key={action.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <StatusBadge status={action.status} />
                <div className="flex-1">
                  <p className="font-medium text-foreground">{action.subject}</p>
                  <p className="text-sm text-muted-foreground">
                    {action.classification} &middot; {formatRelativeTime(action.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    sent: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    rejected: 'bg-red-100 text-red-800',
    failed: 'bg-red-100 text-red-800',
    approved: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={`px-2 py-0.5 text-xs rounded-full ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingAction {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  reasoning: string;
  domain: string;
  tier: string;
  status: string;
  createdAt: string;
}

interface PendingActionBannerProps {
  /** If provided, filters to only show actions for this screen context */
  filter?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function describeAction(action: PendingAction): string {
  const payload = action.payload;
  switch (action.action) {
    case 'email.send': {
      const to = (payload['to'] as string[]) ?? [];
      const subject = (payload['subject'] as string) ?? 'No subject';
      return `Send email to ${to.join(', ')}: "${subject}"`;
    }
    case 'email.draft': {
      const subject = (payload['subject'] as string) ?? 'No subject';
      return `Save draft: "${subject}"`;
    }
    case 'email.archive': {
      const ids = (payload['messageIds'] as string[]) ?? [];
      return `Archive ${ids.length} email${ids.length !== 1 ? 's' : ''}`;
    }
    case 'calendar.create': {
      const title = (payload['title'] as string) ?? 'Untitled event';
      return `Create event: "${title}"`;
    }
    case 'calendar.delete': {
      return `Delete calendar event`;
    }
    default:
      return `${action.action} action`;
  }
}

function getPreviewContent(action: PendingAction): string | null {
  if (action.action === 'email.send' || action.action === 'email.draft') {
    const body = action.payload['body'] as string | undefined;
    if (body) {
      return body.length > 200 ? body.slice(0, 200) + '...' : body;
    }
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PendingActionBanner({ filter }: PendingActionBannerProps) {
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [approvalCounts, setApprovalCounts] = useState<Record<string, { count: number; threshold: number }>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const actions = await invoke<PendingAction[]>('get_pending_actions');
      const filtered = filter ? actions.filter(a => a.domain === filter) : actions;
      setPendingActions(filtered);

      // Load approval counts for each action
      const counts: Record<string, { count: number; threshold: number }> = {};
      for (const action of filtered) {
        try {
          const count = await invoke<number>('get_approval_count', {
            actionType: action.action,
            payload: action.payload,
          });
          const threshold = await invoke<number>('get_approval_threshold', {
            actionType: action.action,
            payload: action.payload,
          });
          counts[action.id] = { count, threshold };
        } catch {
          counts[action.id] = { count: 0, threshold: 3 };
        }
      }
      setApprovalCounts(counts);
    } catch {
      // Sidecar not wired
    }
  }, [filter]);

  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [loadPending]);

  const handleApprove = async (actionId: string) => {
    try {
      await invoke('approve_action', { actionId });
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
    } catch {
      // Error handling
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      await invoke('reject_action', { actionId });
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
    } catch {
      // Error handling
    }
  };

  if (pendingActions.length === 0) return null;

  return (
    <div className="space-y-2">
      {pendingActions.map(action => {
        const preview = getPreviewContent(action);
        const counts = approvalCounts[action.id];
        const isExpanded = expandedId === action.id;

        return (
          <div
            key={action.id}
            className="
              bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark
              border border-semblance-border dark:border-semblance-border-dark
              border-l-[3px] border-l-semblance-primary
              rounded-lg p-4 space-y-2
            "
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                  {describeAction(action)}
                </p>
                <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-0.5">
                  {action.reasoning}
                </p>
              </div>
            </div>

            {/* Preview content */}
            {preview && (
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : action.id)}
                className="w-full text-left"
              >
                <div className={`
                  text-xs font-mono p-2 rounded
                  bg-semblance-surface-1 dark:bg-semblance-surface-1-dark
                  text-semblance-text-primary dark:text-semblance-text-primary-dark
                  ${!isExpanded ? 'line-clamp-2' : ''}
                `}>
                  {preview}
                </div>
              </button>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApprove(action.id)}
                className="
                  px-3 py-1.5 text-sm font-medium rounded-md
                  bg-semblance-primary text-white
                  hover:opacity-90 transition-opacity duration-fast
                "
              >
                {action.action === 'email.send' ? 'Approve & Send' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={() => {/* TODO: open edit mode */}}
                className="
                  px-3 py-1.5 text-sm rounded-md
                  text-semblance-text-secondary dark:text-semblance-text-secondary-dark
                  hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark
                  transition-colors duration-fast
                "
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleReject(action.id)}
                className="
                  px-3 py-1.5 text-sm rounded-md
                  text-semblance-text-secondary dark:text-semblance-text-secondary-dark
                  hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark
                  transition-colors duration-fast
                "
              >
                Reject
              </button>
            </div>

            {/* Approval pattern indicator */}
            {counts && (
              <p className="text-[11px] text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                Similar actions approved: {counts.count} time{counts.count !== 1 ? 's' : ''}
                {counts.count < counts.threshold && (
                  <span> — after {counts.threshold} approvals, this becomes automatic</span>
                )}
                {counts.count >= counts.threshold && (
                  <span className="text-semblance-success"> — this action type is now routine</span>
                )}
              </p>
            )}
          </div>
        );
      })}

      {/* Stacking indicator */}
      {pendingActions.length > 1 && (
        <p className="text-xs text-center text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          {pendingActions.length} pending actions
        </p>
      )}
    </div>
  );
}

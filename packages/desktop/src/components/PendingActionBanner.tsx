import { useCallback, useEffect, useState } from 'react';
import { getPendingActions, getApprovalCount, getApprovalThreshold, approveAction, rejectAction } from '../ipc/commands';
import type { PendingAction } from '../ipc/types';
import './PendingActionBanner.css';

export type { PendingAction } from '../ipc/types';

interface PendingActionBannerProps {
  filter?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function describeAction(action: PendingAction): string {
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
    case 'calendar.delete':
      return 'Delete calendar event';
    default:
      return `${action.action} action`;
  }
}

export function getPreviewContent(action: PendingAction): string | null {
  if (action.action === 'email.send' || action.action === 'email.draft') {
    const body = action.payload['body'] as string | undefined;
    if (body) return body.length > 200 ? body.slice(0, 200) + '...' : body;
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PendingActionBanner({ filter }: PendingActionBannerProps) {
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [approvalCounts, setApprovalCounts] = useState<Record<string, { count: number; threshold: number }>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPayload, setEditPayload] = useState<Record<string, unknown>>({});

  const loadPending = useCallback(async () => {
    try {
      const actions = await getPendingActions();
      const filtered = filter ? actions.filter(a => a.domain === filter) : actions;
      setPendingActions(filtered);

      const counts: Record<string, { count: number; threshold: number }> = {};
      for (const action of filtered) {
        try {
          const count = await getApprovalCount(action.action, action.payload);
          const threshold = await getApprovalThreshold(action.action, action.payload);
          counts[action.id] = { count, threshold };
        } catch {
          counts[action.id] = { count: 0, threshold: 3 };
        }
      }
      setApprovalCounts(counts);
    } catch (err) {
      console.error('[PendingActionBanner] loadPending failed:', err);
    }
  }, [filter]);

  useEffect(() => {
    loadPending();
    const interval = setInterval(loadPending, 5000);
    return () => clearInterval(interval);
  }, [loadPending]);

  const handleApprove = async (actionId: string) => {
    try {
      await approveAction(actionId);
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
    } catch {
      // Error handling
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      await rejectAction(actionId);
      setPendingActions(prev => prev.filter(a => a.id !== actionId));
    } catch {
      // Error handling
    }
  };

  if (pendingActions.length === 0) return null;

  return (
    <div className="pending-actions">
      {pendingActions.map(action => {
        const preview = getPreviewContent(action);
        const counts = approvalCounts[action.id];
        const isExpanded = expandedId === action.id;

        return (
          <div key={action.id} className="pending-action">
            <div className="pending-action__header">
              <div>
                <p className="pending-action__desc">{describeAction(action)}</p>
                <p className="pending-action__reasoning">{action.reasoning}</p>
              </div>
            </div>

            {preview && (
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : action.id)}
                className="pending-action__preview"
              >
                <div className={`pending-action__preview-text${!isExpanded ? ' pending-action__preview-text--clamped' : ''}`}>
                  {preview}
                </div>
              </button>
            )}

            {editingId === action.id && (
              <div className="pending-action__edit-form">
                {(action.action === 'email.send' || action.action === 'email.draft') && (
                  <>
                    <input
                      className="pending-action__edit-input"
                      value={String(editPayload['subject'] ?? '')}
                      onChange={(e) => setEditPayload(prev => ({ ...prev, subject: e.target.value }))}
                      aria-label="Subject"
                    />
                    <textarea
                      className="pending-action__edit-textarea"
                      value={String(editPayload['body'] ?? '')}
                      onChange={(e) => setEditPayload(prev => ({ ...prev, body: e.target.value }))}
                      rows={4}
                      aria-label="Body"
                    />
                  </>
                )}
              </div>
            )}

            <div className="pending-action__actions">
              <button type="button" onClick={() => {
                if (editingId === action.id) {
                  // Apply edits to payload before approving
                  action.payload = { ...action.payload, ...editPayload };
                  setEditingId(null);
                }
                handleApprove(action.id);
              }} className="pending-action__approve-btn">
                {action.action === 'email.send' ? 'Approve & Send' : 'Approve'}
              </button>
              <button type="button" onClick={() => {
                if (editingId === action.id) {
                  setEditingId(null);
                } else {
                  setEditingId(action.id);
                  setEditPayload({ ...action.payload });
                }
              }} className="pending-action__edit-btn">
                {editingId === action.id ? 'Cancel Edit' : 'Edit'}
              </button>
              <button type="button" onClick={() => handleReject(action.id)} className="pending-action__reject-btn">
                Reject
              </button>
            </div>

            {counts && (
              <p className="pending-action__approval-hint">
                Similar actions approved: {counts.count} time{counts.count !== 1 ? 's' : ''}
                {counts.count < counts.threshold && (
                  <span> — after {counts.threshold} approvals, this becomes automatic</span>
                )}
                {counts.count >= counts.threshold && (
                  <span className="pending-action__approval-success"> — this action type is now routine</span>
                )}
              </p>
            )}
          </div>
        );
      })}

      {pendingActions.length > 1 && (
        <p className="pending-actions__count">{pendingActions.length} pending actions</p>
      )}
    </div>
  );
}

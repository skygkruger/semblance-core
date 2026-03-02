import { useCallback, useEffect, useState } from 'react';
import { Card } from '@semblance/ui';
import {
  getInboxItems,
  getProactiveInsights,
  getTodayEvents,
  getActionsSummary,
  archiveEmails,
  undoAction,
  sendEmailAction,
  draftEmailAction,
  dismissInsight,
} from '../ipc/commands';
import { useAppState } from '../state/AppState';
import { EmailCard } from '../components/EmailCard';
import { InsightCard } from '../components/InsightCard';
import { ReplyComposer } from '../components/ReplyComposer';
import { PendingActionBanner } from '../components/PendingActionBanner';

// ─── Types (mirror core types for the desktop boundary) ─────────────────────

export interface IndexedEmail {
  id: string;
  messageId: string;
  threadId: string;
  folder: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string;
  priority: 'high' | 'normal' | 'low';
  accountId: string;
}

interface CalendarEvent {
  id: string;
  uid: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string;
  attendees: string;
  status: string;
}

interface ProactiveInsight {
  id: string;
  type: 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict';
  priority: 'high' | 'normal' | 'low';
  title: string;
  summary: string;
  sourceIds: string[];
  suggestedAction: { actionType: string; payload: Record<string, unknown>; description: string } | null;
  createdAt: string;
  expiresAt: string | null;
  estimatedTimeSavedSeconds: number;
}

interface ActionsSummary {
  todayCount: number;
  todayTimeSavedSeconds: number;
  recentActions: Array<{ description: string; timestamp: string }>;
}

interface ActionTaken {
  type: 'archived' | 'categorized' | 'replied' | 'drafted';
  timestamp: string;
  undoAvailable: boolean;
  description: string;
}

// ─── Helpers (exported for testing) ──────────────────────────────────────────

export function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes} min`;
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function sortEmailsByPriority(emails: IndexedEmail[]): IndexedEmail[] {
  const high = emails.filter(e => e.priority === 'high');
  const normal = emails.filter(e => e.priority === 'normal');
  const low = emails.filter(e => e.priority === 'low');
  return [...high, ...normal, ...low];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function InboxScreen() {
  const state = useAppState();
  const name = state.userName || 'Semblance';

  const [emails, setEmails] = useState<IndexedEmail[]>([]);
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [actionsSummary, setActionsSummary] = useState<ActionsSummary>({
    todayCount: 0,
    todayTimeSavedSeconds: 0,
    recentActions: [],
  });
  const [replyTarget, setReplyTarget] = useState<IndexedEmail | null>(null);
  const [undoToast, setUndoToast] = useState<{ id: string; message: string; actionId: string } | null>(null);

  const loadInboxData = useCallback(async () => {
    try {
      const [emailResult, insightResult, calendarResult, actionsResult] = await Promise.allSettled([
        getInboxItems(30, 0),
        getProactiveInsights(),
        getTodayEvents(),
        getActionsSummary(),
      ]);

      if (emailResult.status === 'fulfilled') setEmails(emailResult.value as unknown as IndexedEmail[]);
      if (insightResult.status === 'fulfilled') setInsights(insightResult.value as unknown as ProactiveInsight[]);
      if (calendarResult.status === 'fulfilled') setTodayEvents(calendarResult.value as unknown as CalendarEvent[]);
      if (actionsResult.status === 'fulfilled') setActionsSummary(actionsResult.value as unknown as ActionsSummary);
    } catch {
      // Sidecar not yet wired — silent in dev
    }
  }, []);

  useEffect(() => {
    loadInboxData();
    // Refresh every 60 seconds
    const interval = setInterval(loadInboxData, 60_000);
    return () => clearInterval(interval);
  }, [loadInboxData]);

  const handleArchive = async (email: IndexedEmail) => {
    try {
      const actionId = await archiveEmails([email.messageId]);
      setEmails(prev => prev.filter(e => e.messageId !== email.messageId));

      setUndoToast({
        id: email.messageId,
        message: `Archived "${email.subject}"`,
        actionId,
      });

      // Auto-dismiss after 8 seconds
      setTimeout(() => {
        setUndoToast(prev => prev?.id === email.messageId ? null : prev);
      }, 8000);
    } catch {
      // Sidecar not wired
    }
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    try {
      await undoAction(undoToast.actionId);
      setUndoToast(null);
      loadInboxData();
    } catch {
      // Undo failed — already expired
    }
  };

  const handleReply = (email: IndexedEmail) => {
    setReplyTarget(email);
  };

  const handleSendReply = async (to: string[], subject: string, body: string, replyToMessageId?: string) => {
    try {
      await sendEmailAction({ to, subject, body, replyToMessageId });
      setReplyTarget(null);
      loadInboxData();
    } catch {
      // Queued for approval or error
    }
  };

  const handleDismissInsight = async (insightId: string) => {
    try {
      await dismissInsight(insightId);
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch {
      // Sidecar not wired
    }
  };

  const highPriorityEmails = emails.filter(e => e.priority === 'high');
  const normalEmails = emails.filter(e => e.priority === 'normal');
  const lowEmails = emails.filter(e => e.priority === 'low');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
          Inbox
        </h1>

        {/* Pending Action Approvals */}
        <PendingActionBanner />

        {/* Priority / Proactive Section */}
        {insights.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark uppercase tracking-wide">
              Priority
            </h2>
            <div className="space-y-2">
              {insights.map(insight => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onDismiss={() => handleDismissInsight(insight.id)}
                  onExpand={() => {/* TODO: expand insight detail */}}
                  onExecuteSuggestion={() => {/* TODO: execute suggested action */}}
                />
              ))}
            </div>
          </section>
        )}

        {/* Email Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark uppercase tracking-wide">
            Email
          </h2>

          {emails.length === 0 ? (
            <Card>
              <p className="text-center text-semblance-text-secondary dark:text-semblance-text-secondary-dark py-8">
                No emails yet. Connect an email account in Settings to get started.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {[...highPriorityEmails, ...normalEmails, ...lowEmails].map(email => (
                <EmailCard
                  key={email.messageId}
                  email={email}
                  aiCategory={(() => {
                    try { return JSON.parse(email.labels) as string[]; } catch { return []; }
                  })()}
                  aiPriority={email.priority}
                  actionTaken={null}
                  onReply={() => handleReply(email)}
                  onArchive={() => handleArchive(email)}
                  onSnooze={() => {/* TODO */}}
                  onExpand={() => {/* TODO */}}
                />
              ))}
            </div>
          )}

          {/* Reply Composer */}
          {replyTarget && (
            <ReplyComposer
              email={replyTarget}
              onSend={handleSendReply}
              onSaveDraft={async (to, subject, body, replyToMessageId) => {
                try {
                  await draftEmailAction({ to, subject, body, replyToMessageId });
                  setReplyTarget(null);
                } catch { /* */ }
              }}
              onCancel={() => setReplyTarget(null)}
            />
          )}
        </section>

        {/* Calendar Today Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark uppercase tracking-wide">
            Calendar Today
          </h2>

          {todayEvents.length === 0 ? (
            <Card>
              <p className="text-center text-semblance-text-secondary dark:text-semblance-text-secondary-dark py-4">
                No events today.
              </p>
            </Card>
          ) : (
            <Card>
              <div className="space-y-3">
                {todayEvents.map(event => (
                  <div
                    key={event.uid}
                    className="flex items-start gap-3 py-2 border-b last:border-b-0 border-semblance-border dark:border-semblance-border-dark"
                  >
                    <span className="text-sm font-mono text-semblance-text-secondary dark:text-semblance-text-secondary-dark whitespace-nowrap min-w-[70px]">
                      {event.isAllDay ? 'All day' : formatTime(event.startTime)}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                        {event.title}
                      </p>
                      {event.location && (
                        <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                          {event.location}
                        </p>
                      )}
                    </div>
                    {event.status === 'tentative' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-semblance-attention/10 text-semblance-attention">
                        Tentative
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </section>

        {/* Actions Taken Section */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark uppercase tracking-wide">
            Actions Taken
          </h2>
          <Card>
            {actionsSummary.todayCount === 0 ? (
              <p className="text-center text-semblance-text-secondary dark:text-semblance-text-secondary-dark py-4">
                No actions taken today yet.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
                    Today: {actionsSummary.todayCount} action{actionsSummary.todayCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-semblance-success">
                    {formatTimeSaved(actionsSummary.todayTimeSavedSeconds)} saved
                  </span>
                </div>
                <ul className="space-y-1">
                  {actionsSummary.recentActions.slice(0, 5).map((action, i) => (
                    <li
                      key={i}
                      className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark flex items-center gap-2"
                    >
                      <span className="w-1 h-1 rounded-full bg-semblance-success flex-shrink-0" />
                      {action.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </section>

        {/* Undo Toast */}
        {undoToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-semblance-surface-2 dark:bg-semblance-surface-2-dark border border-semblance-border dark:border-semblance-border-dark">
            <span className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark">
              {undoToast.message}
            </span>
            <button
              type="button"
              onClick={handleUndo}
              className="text-sm font-medium text-semblance-accent hover:underline"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

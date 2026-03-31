// @i18n-pending — email detail labels (From/To) need i18n pass
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, ApprovalCard } from '@semblance/ui';
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
  getPendingActions,
  approveAction,
  rejectAction,
  getReminders,
  snoozeReminder,
  dismissReminder,
  getDarkPatternFlags,
  dismissDarkPatternFlag,
  quickCapture,
  getClipboardInsights,
  executeClipboardAction,
  dismissClipboardInsight,
  listConnectorAccounts,
} from '../ipc/commands';
import type { OAuthAccount } from '../ipc/commands';
import type { PendingAction, ReminderData, DarkPatternResult, ClipboardInsightData } from '../ipc/types';
import { useAppState } from '../state/AppState';
import { useTauriEvent } from '../hooks/useTauriEvent';
import { EmailCard } from '../components/EmailCard';
import { InsightCard } from '../components/InsightCard';
import { ReplyComposer } from '../components/ReplyComposer';
import { PendingActionBanner } from '../components/PendingActionBanner';
import { ReminderCard } from '../components/ReminderCard';
import { MessageDraftCard } from '../components/MessageDraftCard';
import { DarkPatternBadge } from '../components/DarkPatternBadge';
import { QuickCaptureInput } from '../components/QuickCaptureInput';
import { ClipboardInsightToast } from '../components/ClipboardInsightToast';

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
  const { t } = useTranslation();
  const state = useAppState();
  const name = state.semblanceName || 'Semblance';

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
  const [pendingApprovals, setPendingApprovals] = useState<PendingAction[]>([]);
  const [reminders, setReminders] = useState<ReminderData[]>([]);
  const [darkPatternFlags, setDarkPatternFlags] = useState<DarkPatternResult[]>([]);
  const [clipboardInsight, setClipboardInsight] = useState<ClipboardInsightData | null>(null);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [snoozeToast, setSnoozeToast] = useState<{ id: string; message: string } | null>(null);
  const [emailAccounts, setEmailAccounts] = useState<OAuthAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null); // null = all accounts
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const loadInboxData = useCallback(async () => {
    try {
      const [emailResult, insightResult, calendarResult, actionsResult] = await Promise.allSettled([
        getInboxItems(30, 0, selectedAccount ?? undefined),
        getProactiveInsights(),
        getTodayEvents(),
        getActionsSummary(),
      ]);

      if (emailResult.status === 'fulfilled' && Array.isArray(emailResult.value)) setEmails(emailResult.value as unknown as IndexedEmail[]);
      if (insightResult.status === 'fulfilled' && Array.isArray(insightResult.value)) setInsights(insightResult.value as unknown as ProactiveInsight[]);
      if (calendarResult.status === 'fulfilled' && Array.isArray(calendarResult.value)) setTodayEvents(calendarResult.value as unknown as CalendarEvent[]);
      if (actionsResult.status === 'fulfilled') {
        const raw = actionsResult.value as unknown as ActionsSummary | null;
        setActionsSummary({
          todayCount: raw?.todayCount ?? 0,
          todayTimeSavedSeconds: raw?.todayTimeSavedSeconds ?? 0,
          recentActions: raw?.recentActions ?? [],
        });
      }
    } catch (err) {
      console.error('[InboxScreen] loadInboxData failed:', err);
    }
  }, [selectedAccount]);

  const loadExtras = useCallback(async () => {
    try {
      const [approvals, rems, flags, clips] = await Promise.allSettled([
        getPendingActions(),
        getReminders(),
        getDarkPatternFlags(),
        getClipboardInsights(),
      ]);
      if (approvals.status === 'fulfilled' && Array.isArray(approvals.value)) setPendingApprovals(approvals.value.filter(a => a.status === 'pending_approval'));
      if (rems.status === 'fulfilled' && Array.isArray(rems.value)) setReminders(rems.value);
      if (flags.status === 'fulfilled' && Array.isArray(flags.value)) setDarkPatternFlags(flags.value);
      if (clips.status === 'fulfilled' && Array.isArray(clips.value) && clips.value.length > 0) setClipboardInsight(clips.value[0]!);
    } catch (err) {
      console.error('[InboxScreen] loadExtras failed:', err);
    }
  }, []);

  // Load email accounts for the account filter tabs
  useEffect(() => {
    listConnectorAccounts('gmail')
      .then(accounts => setEmailAccounts(accounts ?? []))
      .catch(() => setEmailAccounts([]));
  }, []);

  useEffect(() => {
    loadInboxData();
    loadExtras();
    // Refresh every 60 seconds
    const interval = setInterval(loadInboxData, 60_000);
    return () => clearInterval(interval);
  }, [loadInboxData, loadExtras]);

  // Clean up undo toast timeout on unmount
  useEffect(() => {
    return () => { clearTimeout(undoTimeoutRef.current); };
  }, []);

  // Refresh inbox immediately when new data is indexed (don't wait for 60s poll)
  useTauriEvent('semblance://indexing-complete', loadInboxData);

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
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = setTimeout(() => {
        setUndoToast(prev => prev?.id === email.messageId ? null : prev);
      }, 8000);
    } catch (err) {
      console.error('[InboxScreen] archive failed:', err);
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
    } catch (err) {
      console.error('[InboxScreen] dismiss insight failed:', err);
    }
  };

  const handleSnooze = (email: IndexedEmail) => {
    // Hide the email for 1 hour (local only — remove from list, show toast)
    setEmails(prev => prev.filter(e => e.messageId !== email.messageId));
    setSnoozeToast({ id: email.messageId, message: `Snoozed "${email.subject}" for 1 hour` });
    // Auto-dismiss the toast after 5 seconds
    setTimeout(() => {
      setSnoozeToast(prev => prev?.id === email.messageId ? null : prev);
    }, 5000);
  };

  const handleExpand = (email: IndexedEmail) => {
    setExpandedEmailId(expandedEmailId === email.messageId ? null : email.messageId);
  };

  const highPriorityEmails = emails.filter(e => e.priority === 'high');
  const normalEmails = emails.filter(e => e.priority === 'normal');
  const lowEmails = emails.filter(e => e.priority === 'low');

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8 space-y-6">
        <h1 className="page-title" style={{ fontSize: 28 }}>
          {t('screen.inbox.title')}
        </h1>

        {/* Account Filter Tabs — only show when multiple accounts exist */}
        {emailAccounts.length > 1 && (
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
            <button
              type="button"
              onClick={() => setSelectedAccount(null)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                background: selectedAccount === null ? 'rgba(110,207,163,0.15)' : '#171B1F',
                color: selectedAccount === null ? '#6ECFA3' : '#5E6B7C',
                fontFamily: "'DM Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('screen.inbox.all_accounts', 'All Accounts')}
            </button>
            {emailAccounts.map(acc => (
              <button
                type="button"
                key={acc.accountId}
                onClick={() => setSelectedAccount(acc.accountId)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: selectedAccount === acc.accountId ? 'rgba(110,207,163,0.15)' : '#171B1F',
                  color: selectedAccount === acc.accountId ? '#6ECFA3' : '#5E6B7C',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {acc.userEmail}
              </button>
            ))}
          </div>
        )}

        {/* Quick Capture */}
        <QuickCaptureInput
          placeholder="Search inbox, draft an email, or ask about your messages..."
          onCapture={async (text) => {
            const result = await quickCapture(text);
            return result;
          }}
        />

        {/* Pending Action Approvals */}
        <PendingActionBanner />

        {/* Approval Cards */}
        {pendingApprovals.map(action => (
          <ApprovalCard
            key={action.id}
            action={action.action}
            context={action.reasoning}
            onApprove={async () => {
              await approveAction(action.id).catch(() => {});
              setPendingApprovals(prev => prev.filter(a => a.id !== action.id));
            }}
            onDismiss={async () => {
              await rejectAction(action.id).catch(() => {});
              setPendingApprovals(prev => prev.filter(a => a.id !== action.id));
            }}
          />
        ))}

        {/* Reminders */}
        {reminders.length > 0 && (
          <section className="space-y-2">
            <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('screen.inbox.section_reminders', 'Reminders')}
            </h2>
            {reminders.map(reminder => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onSnooze={(id, dur) => {
                  snoozeReminder(id, dur).catch(() => {});
                  setReminders(prev => prev.filter(r => r.id !== id));
                }}
                onDismiss={(id) => {
                  dismissReminder(id).catch(() => {});
                  setReminders(prev => prev.filter(r => r.id !== id));
                }}
              />
            ))}
          </section>
        )}

        {/* Dark Pattern Flags */}
        {darkPatternFlags.length > 0 && (
          <section className="space-y-2">
            {darkPatternFlags.map(flag => (
              <DarkPatternBadge
                key={flag.contentId}
                flag={flag}
                onDismiss={(contentId) => {
                  dismissDarkPatternFlag(contentId).catch(() => {});
                  setDarkPatternFlags(prev => prev.filter(f => f.contentId !== contentId));
                }}
              />
            ))}
          </section>
        )}

        {/* Priority / Proactive Section */}
        {insights.length > 0 && (
          <section className="space-y-3">
            <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {t('screen.inbox.section_priority')}
            </h2>
            <div className="space-y-2">
              {insights.map(insight => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onDismiss={() => handleDismissInsight(insight.id)}
                  onExpand={() => setExpandedInsightId(expandedInsightId === insight.id ? null : insight.id)}
                  onExecuteSuggestion={() => {
                    if (insight.suggestedAction) {
                      sendEmailAction(insight.suggestedAction.payload as { to: string[]; subject: string; body: string; replyToMessageId?: string })
                        .then(() => handleDismissInsight(insight.id))
                        .catch(() => {});
                    }
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Email Section */}
        <section className="space-y-3">
          <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('screen.inbox.section_email')}
          </h2>

          {emails.length === 0 ? (
            <Card>
              <p style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em', paddingTop: 32, paddingBottom: 32 }}>
                {t('screen.inbox.empty_email')}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {[...highPriorityEmails, ...normalEmails, ...lowEmails].map(email => (
                <div key={email.messageId}>
                  <EmailCard
                    email={email}
                    aiCategory={(() => {
                      try { return JSON.parse(email.labels) as string[]; } catch { return []; }
                    })()}
                    aiPriority={email.priority}
                    actionTaken={null}
                    onReply={() => handleReply(email)}
                    onArchive={() => handleArchive(email)}
                    onSnooze={() => handleSnooze(email)}
                    onExpand={() => handleExpand(email)}
                  />
                  {/* Expanded email view */}
                  {expandedEmailId === email.messageId && (
                    <div className="surface-slate" style={{
                      padding: '12px 16px',
                      margin: '-2px 0 0 0',
                      borderTop: 'none',
                      borderRadius: '0 0 8px 8px',
                      fontFamily: "'DM Mono', monospace",
                      fontSize: 12,
                      color: '#A8B4C0',
                      letterSpacing: '0.04em',
                      lineHeight: 1.6,
                    }}>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, color: '#5E6B7C' }}>
                        <span>From: {email.fromName || email.from}</span>
                        <span>To: {email.to || 'me'}</span>
                      </div>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{email.snippet}</p>
                    </div>
                  )}
                </div>
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
          <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('screen.inbox.section_calendar')}
          </h2>

          {todayEvents.length === 0 ? (
            <Card>
              <p style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em', paddingTop: 16, paddingBottom: 16 }}>
                {t('screen.inbox.empty_calendar')}
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
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', whiteSpace: 'nowrap', minWidth: 70 }}>
                      {event.isAllDay ? t('time.all_day') : formatTime(event.startTime)}
                    </span>
                    <div className="flex-1">
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 400, color: '#EEF1F4', letterSpacing: '0.04em', margin: 0 }}>
                        {event.title}
                      </p>
                      {event.location && (
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', margin: '2px 0 0' }}>
                          {event.location}
                        </p>
                      )}
                    </div>
                    {event.status === 'tentative' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-semblance-attention/10 text-semblance-attention">
                        {t('status.tentative')}
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
          <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('screen.inbox.section_actions')}
          </h2>
          <Card>
            {actionsSummary.todayCount === 0 ? (
              <p style={{ textAlign: 'center', fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em', paddingTop: 16, paddingBottom: 16 }}>
                {t('screen.inbox.empty_actions')}
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 400, color: '#EEF1F4', letterSpacing: '0.04em' }}>
                    {t('screen.inbox.today_actions', { count: actionsSummary.todayCount })}
                  </span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6ECFA3', letterSpacing: '0.04em' }}>
                    {t('screen.inbox.time_saved', { time: formatTimeSaved(actionsSummary.todayTimeSavedSeconds) })}
                  </span>
                </div>
                <ul className="space-y-1">
                  {actionsSummary.recentActions.slice(0, 5).map((action, i) => (
                    <li
                      key={i}
                      style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#A8B4C0', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 }}
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

        {/* Clipboard Insight Toast */}
        {clipboardInsight && (
          <ClipboardInsightToast
            patternDescription={clipboardInsight.patternDescription}
            actionLabel={clipboardInsight.actionLabel}
            onAction={() => {
              executeClipboardAction(clipboardInsight.actionId).catch(() => {});
              setClipboardInsight(null);
            }}
            onDismiss={() => {
              dismissClipboardInsight(clipboardInsight.actionId).catch(() => {});
              setClipboardInsight(null);
            }}
          />
        )}

        {/* Snooze Toast */}
        {snoozeToast && (
          <div className="fixed bottom-16 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-semblance-surface-2 dark:bg-semblance-surface-2-dark" style={{ border: '1px solid rgba(255,255,255,0.09)' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>
              {snoozeToast.message}
            </span>
          </div>
        )}

        {/* Undo Toast */}
        {undoToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-semblance-surface-2 dark:bg-semblance-surface-2-dark" style={{ border: '1px solid rgba(255,255,255,0.09)' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>
              {undoToast.message}
            </span>
            <button
              type="button"
              onClick={handleUndo}
              style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 400, color: '#6ECFA3', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em' }}
            >
              {t('button.undo')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

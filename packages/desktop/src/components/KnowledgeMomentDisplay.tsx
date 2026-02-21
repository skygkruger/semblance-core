import { useState, useEffect } from 'react';
import { Button } from '@semblance/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

interface KnowledgeMoment {
  tier: 1 | 2 | 3 | 4 | 5;
  upcomingMeeting: {
    title: string;
    startTime: string;
    attendees: string[];
  } | null;
  emailContext: {
    attendeeName: string;
    recentEmailCount: number;
    lastEmailSubject: string;
    lastEmailDate: string;
    hasUnansweredEmail: boolean;
    unansweredSubject: string | null;
  } | null;
  relatedDocuments: Array<{
    fileName: string;
    filePath: string;
    relevanceReason: string;
  }>;
  message: string;
  suggestedAction: {
    type: 'draft_reply' | 'create_reminder' | 'prepare_meeting';
    description: string;
  } | null;
}

interface KnowledgeMomentDisplayProps {
  moment: KnowledgeMoment;
  aiName: string;
  onSuggestedAction?: () => void;
  onContinue: () => void;
  /** If true, uses the theatrical onboarding presentation with progressive disclosure */
  isOnboarding?: boolean;
}

// ─── Source indicator icons ─────────────────────────────────────────────────

function SourceIndicator({ type, active }: { type: 'email' | 'calendar' | 'files'; active: boolean }) {
  const opacity = active ? 'opacity-100' : 'opacity-30';
  const color = active ? 'text-semblance-primary' : 'text-semblance-muted';

  const icons: Record<string, JSX.Element> = {
    email: (
      <svg className={`w-5 h-5 ${color} ${opacity} transition-opacity duration-[800ms]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    calendar: (
      <svg className={`w-5 h-5 ${color} ${opacity} transition-opacity duration-[800ms]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
      </svg>
    ),
    files: (
      <svg className={`w-5 h-5 ${color} ${opacity} transition-opacity duration-[800ms]`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
    ),
  };

  return icons[type] ?? null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function KnowledgeMomentDisplay({
  moment,
  aiName,
  onSuggestedAction,
  onContinue,
  isOnboarding = false,
}: KnowledgeMomentDisplayProps) {
  // Progressive disclosure for onboarding
  const [revealStage, setRevealStage] = useState(isOnboarding ? 0 : 4);

  useEffect(() => {
    if (!isOnboarding) return;
    const timers = [
      setTimeout(() => setRevealStage(1), 800),    // Meeting
      setTimeout(() => setRevealStage(2), 2000),   // Email context
      setTimeout(() => setRevealStage(3), 3200),   // Documents
      setTimeout(() => setRevealStage(4), 4400),   // Action
    ];
    return () => timers.forEach(clearTimeout);
  }, [isOnboarding]);

  const fadeIn = (stage: number) =>
    revealStage >= stage
      ? 'opacity-100 translate-y-0 transition-all duration-[800ms] ease-out'
      : 'opacity-0 translate-y-2';

  const hasEmail = moment.emailContext !== null;
  const hasCalendar = moment.upcomingMeeting !== null;
  const hasDocs = moment.relatedDocuments.length > 0;

  return (
    <div className="space-y-6">
      {/* Source indicators */}
      <div className={`flex items-center justify-center gap-6 ${fadeIn(0)}`}>
        <div className="flex flex-col items-center gap-1">
          <SourceIndicator type="email" active={hasEmail && revealStage >= 2} />
          <span className="text-[10px] text-semblance-muted">Email</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <SourceIndicator type="calendar" active={hasCalendar && revealStage >= 1} />
          <span className="text-[10px] text-semblance-muted">Calendar</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <SourceIndicator type="files" active={hasDocs && revealStage >= 3} />
          <span className="text-[10px] text-semblance-muted">Files</span>
        </div>
      </div>

      {/* Meeting context */}
      {moment.upcomingMeeting && (
        <div className={fadeIn(1)}>
          <div className="p-4 rounded-lg bg-semblance-surface-2-dark/50 border border-semblance-border-dark/30">
            <p className="text-sm font-medium text-semblance-text-primary-dark">
              {moment.upcomingMeeting.title}
            </p>
            <p className="text-xs text-semblance-muted mt-1">
              {new Date(moment.upcomingMeeting.startTime).toLocaleString([], {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {moment.upcomingMeeting.attendees.length > 0 && (
                <> · {moment.upcomingMeeting.attendees.length} attendee{moment.upcomingMeeting.attendees.length !== 1 ? 's' : ''}</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Email context */}
      {moment.emailContext && (
        <div className={fadeIn(2)}>
          <div className="p-4 rounded-lg bg-semblance-surface-2-dark/50 border border-semblance-border-dark/30">
            <p className="text-sm text-semblance-text-primary-dark">
              {moment.emailContext.recentEmailCount} emails with <span className="font-medium">{moment.emailContext.attendeeName}</span>
            </p>
            <p className="text-xs text-semblance-muted mt-1">
              Latest: &ldquo;{moment.emailContext.lastEmailSubject}&rdquo;
            </p>
            {moment.emailContext.hasUnansweredEmail && (
              <p className="text-xs text-semblance-attention mt-1">
                Unanswered: &ldquo;{moment.emailContext.unansweredSubject}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}

      {/* Related documents */}
      {moment.relatedDocuments.length > 0 && (
        <div className={fadeIn(3)}>
          <div className="p-4 rounded-lg bg-semblance-surface-2-dark/50 border border-semblance-border-dark/30">
            <p className="text-xs text-semblance-muted mb-2">Related documents:</p>
            {moment.relatedDocuments.map((doc, i) => (
              <p key={i} className="text-sm text-semblance-text-primary-dark">
                {doc.fileName}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Main message */}
      <div className={fadeIn(isOnboarding ? 2 : 0)}>
        <p className="text-sm text-semblance-text-secondary-dark italic text-center">
          {moment.message}
        </p>
      </div>

      {/* Suggested action + continue */}
      <div className={`flex flex-col items-center gap-3 ${fadeIn(4)}`}>
        {moment.suggestedAction && onSuggestedAction && (
          <Button onClick={onSuggestedAction}>
            {moment.suggestedAction.description}
          </Button>
        )}
        <Button variant="ghost" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Button } from '@semblance/ui';
import './KnowledgeMomentDisplay.css';

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
  isOnboarding?: boolean;
}

// ─── Source indicator icons ─────────────────────────────────────────────────

function SourceIndicator({ type, active }: { type: 'email' | 'calendar' | 'files'; active: boolean }) {
  const cls = active ? 'km-display__source-icon--active' : 'km-display__source-icon--inactive';

  const icons: Record<string, JSX.Element> = {
    email: (
      <svg className={`km-display__source-icon ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
      </svg>
    ),
    calendar: (
      <svg className={`km-display__source-icon ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
      </svg>
    ),
    files: (
      <svg className={`km-display__source-icon ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
  const [revealStage, setRevealStage] = useState(isOnboarding ? 0 : 4);

  useEffect(() => {
    if (!isOnboarding) return;
    const timers = [
      setTimeout(() => setRevealStage(1), 800),
      setTimeout(() => setRevealStage(2), 2000),
      setTimeout(() => setRevealStage(3), 3200),
      setTimeout(() => setRevealStage(4), 4400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [isOnboarding]);

  const revealCls = (stage: number) =>
    `km-display__reveal ${revealStage >= stage ? 'km-display__reveal--visible' : 'km-display__reveal--hidden'}`;

  const hasEmail = moment.emailContext !== null;
  const hasCalendar = moment.upcomingMeeting !== null;
  const hasDocs = moment.relatedDocuments.length > 0;

  return (
    <div className="km-display">
      {/* Source indicators */}
      <div className={`km-display__sources ${revealCls(0)}`}>
        <div className="km-display__source">
          <SourceIndicator type="email" active={hasEmail && revealStage >= 2} />
          <span className="km-display__source-label">Email</span>
        </div>
        <div className="km-display__source">
          <SourceIndicator type="calendar" active={hasCalendar && revealStage >= 1} />
          <span className="km-display__source-label">Calendar</span>
        </div>
        <div className="km-display__source">
          <SourceIndicator type="files" active={hasDocs && revealStage >= 3} />
          <span className="km-display__source-label">Files</span>
        </div>
      </div>

      {/* Meeting context */}
      {moment.upcomingMeeting && (
        <div className={revealCls(1)}>
          <div className="km-display__card">
            <p className="km-display__card-title">{moment.upcomingMeeting.title}</p>
            <p className="km-display__card-meta">
              {new Date(moment.upcomingMeeting.startTime).toLocaleString([], {
                weekday: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {moment.upcomingMeeting.attendees.length > 0 && (
                <> &middot; {moment.upcomingMeeting.attendees.length} attendee{moment.upcomingMeeting.attendees.length !== 1 ? 's' : ''}</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Email context */}
      {moment.emailContext && (
        <div className={revealCls(2)}>
          <div className="km-display__card">
            <p className="km-display__email-count">
              {moment.emailContext.recentEmailCount} emails with <span className="km-display__email-name">{moment.emailContext.attendeeName}</span>
            </p>
            <p className="km-display__email-latest">
              Latest: &ldquo;{moment.emailContext.lastEmailSubject}&rdquo;
            </p>
            {moment.emailContext.hasUnansweredEmail && (
              <p className="km-display__unanswered">
                Unanswered: &ldquo;{moment.emailContext.unansweredSubject}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}

      {/* Related documents */}
      {moment.relatedDocuments.length > 0 && (
        <div className={revealCls(3)}>
          <div className="km-display__card">
            <p className="km-display__docs-label">Related documents:</p>
            {moment.relatedDocuments.map((doc, i) => (
              <p key={i} className="km-display__doc-name">{doc.fileName}</p>
            ))}
          </div>
        </div>
      )}

      {/* Main message */}
      <div className={revealCls(isOnboarding ? 2 : 0)}>
        <p className="km-display__message">{moment.message}</p>
      </div>

      {/* Suggested action + continue */}
      <div className={`km-display__actions ${revealCls(4)}`}>
        {moment.suggestedAction && onSuggestedAction && (
          <Button onClick={onSuggestedAction}>{moment.suggestedAction.description}</Button>
        )}
        <Button variant="ghost" onClick={onContinue}>Continue</Button>
      </div>
    </div>
  );
}

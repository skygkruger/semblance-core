// DailyDigestCard — Dismissible, expandable inbox card showing today's digest.

import { useState } from 'react';
import { Card } from '@semblance/ui';
import './DailyDigestCard.css';

export interface DailyDigestData {
  id: string;
  summary: string;
  totalActions: number;
  timeSavedFormatted: string;
  emailsHandled: number;
  meetingsPrepped: number;
  remindersCreated: number;
  webSearches: number;
  dismissed: boolean;
}

interface DailyDigestCardProps {
  digest: DailyDigestData;
  onDismiss: (id: string) => void;
}

export function DailyDigestCard({ digest, onDismiss }: DailyDigestCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (digest.dismissed) return null;

  return (
    <Card>
      <div className="daily-digest__header">
        <div>
          <div className="daily-digest__label-row">
            <span className="daily-digest__label">Daily Digest</span>
            <span className="daily-digest__stats">
              {digest.totalActions} actions | ~{digest.timeSavedFormatted} saved
            </span>
          </div>
          <p className="daily-digest__summary">{digest.summary}</p>
        </div>
        <div className="daily-digest__controls">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="daily-digest__toggle-btn"
            aria-label={expanded ? 'Collapse digest' : 'Expand digest'}
          >
            {expanded ? 'Less' : 'More'}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(digest.id)}
            className="daily-digest__dismiss-btn"
            aria-label="Dismiss daily digest"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="daily-digest__details">
          {digest.emailsHandled > 0 && (
            <div className="daily-digest__detail-item">Emails: {digest.emailsHandled}</div>
          )}
          {digest.meetingsPrepped > 0 && (
            <div className="daily-digest__detail-item">Meetings: {digest.meetingsPrepped}</div>
          )}
          {digest.remindersCreated > 0 && (
            <div className="daily-digest__detail-item">Reminders: {digest.remindersCreated}</div>
          )}
          {digest.webSearches > 0 && (
            <div className="daily-digest__detail-item">Searches: {digest.webSearches}</div>
          )}
        </div>
      )}
    </Card>
  );
}

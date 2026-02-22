// DailyDigestCard — Dismissible, expandable inbox card showing today's digest.

import { useState } from 'react';

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
    <div className="rounded-lg border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-2 dark:bg-semblance-surface-2-dark p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-semblance-accent uppercase tracking-wider">
              Daily Digest
            </span>
            <span className="text-xs text-semblance-text-tertiary">
              {digest.totalActions} actions | ~{digest.timeSavedFormatted} saved
            </span>
          </div>
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {digest.summary}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-semblance-text-tertiary hover:text-semblance-text-secondary transition-colors"
            aria-label={expanded ? 'Collapse digest' : 'Expand digest'}
          >
            {expanded ? 'Less' : 'More'}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(digest.id)}
            className="text-semblance-text-tertiary hover:text-semblance-text-secondary transition-colors"
            aria-label="Dismiss daily digest"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-semblance-border dark:border-semblance-border-dark grid grid-cols-2 gap-2 text-xs text-semblance-text-tertiary">
          {digest.emailsHandled > 0 && (
            <div>Emails: {digest.emailsHandled}</div>
          )}
          {digest.meetingsPrepped > 0 && (
            <div>Meetings: {digest.meetingsPrepped}</div>
          )}
          {digest.remindersCreated > 0 && (
            <div>Reminders: {digest.remindersCreated}</div>
          )}
          {digest.webSearches > 0 && (
            <div>Searches: {digest.webSearches}</div>
          )}
        </div>
      )}
    </div>
  );
}

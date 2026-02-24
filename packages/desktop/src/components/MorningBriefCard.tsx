// MorningBriefCard — Warm Amber header, collapsible sections, dismiss button.

import { useState } from 'react';

export interface MorningBriefData {
  id: string;
  summary: string;
  sections: Array<{
    type: string;
    title: string;
    items: Array<{
      id: string;
      text: string;
      context?: string;
      actionable: boolean;
      suggestedAction?: string;
    }>;
  }>;
  estimatedReadTimeSeconds: number;
  dismissed: boolean;
}

interface MorningBriefCardProps {
  brief: MorningBriefData;
  onDismiss: (id: string) => void;
}

export function MorningBriefCard({ brief, onDismiss }: MorningBriefCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (brief.dismissed) return null;

  const readTimeLabel = brief.estimatedReadTimeSeconds < 60
    ? `${brief.estimatedReadTimeSeconds}s read`
    : `${Math.round(brief.estimatedReadTimeSeconds / 60)}m read`;

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Morning Brief
            </span>
            <span className="text-xs text-semblance-text-tertiary">
              {readTimeLabel}
            </span>
          </div>
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {brief.summary}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-semblance-text-tertiary hover:text-semblance-text-secondary transition-colors"
            aria-label={expanded ? 'Collapse brief' : 'Expand brief'}
          >
            {expanded ? 'Less' : 'More'}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(brief.id)}
            className="text-semblance-text-tertiary hover:text-semblance-text-secondary transition-colors"
            aria-label="Dismiss morning brief"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && brief.sections.length > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800 space-y-3">
          {brief.sections.map(section => (
            <div key={section.type}>
              <h4 className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-1">
                {section.title}
              </h4>
              <ul className="space-y-1">
                {section.items.map(item => (
                  <li key={item.id} className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                    {item.text}
                    {item.context && (
                      <span className="text-xs text-semblance-text-tertiary ml-2">
                        ({item.context})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

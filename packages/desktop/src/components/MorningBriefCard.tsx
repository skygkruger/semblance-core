// MorningBriefCard — Warm Amber accent, collapsible sections, dismiss button.

import { useState } from 'react';
import { Card } from '@semblance/ui';
import './MorningBriefCard.css';

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
    <Card className="morning-brief">
      <div className="morning-brief__header">
        <div>
          <div className="morning-brief__label-row">
            <span className="morning-brief__label">Morning Brief</span>
            <span className="morning-brief__read-time">{readTimeLabel}</span>
          </div>
          <p className="morning-brief__summary">{brief.summary}</p>
        </div>
        <div className="morning-brief__controls">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="morning-brief__toggle-btn"
            aria-label={expanded ? 'Collapse brief' : 'Expand brief'}
          >
            {expanded ? 'Less' : 'More'}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(brief.id)}
            className="morning-brief__dismiss-btn"
            aria-label="Dismiss morning brief"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && brief.sections.length > 0 && (
        <div className="morning-brief__sections">
          {brief.sections.map(section => (
            <div key={section.type}>
              <h4 className="morning-brief__section-title">{section.title}</h4>
              <ul className="morning-brief__items">
                {section.items.map(item => (
                  <li key={item.id} className="morning-brief__item">
                    {item.text}
                    {item.context && (
                      <span className="morning-brief__item-context">({item.context})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

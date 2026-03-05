/**
 * Dark Pattern Badge — Alert card for flagged manipulative content.
 * Card + font treatment matches ActionCard exactly.
 */

import { useState } from 'react';
import './DarkPatternBadge.css';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedPatternDisplay {
  category: string;
  evidence: string;
  confidence: number;
}

export interface DarkPatternFlag {
  contentId: string;
  confidence: number;
  patterns: DetectedPatternDisplay[];
  reframe: string;
}

interface DarkPatternBadgeProps {
  flag: DarkPatternFlag;
  onDismiss?: (contentId: string) => void;
}

function formatCategory(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DarkPatternBadge({ flag, onDismiss }: DarkPatternBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const topCategory = flag.patterns[0]
    ? formatCategory(flag.patterns[0].category)
    : 'Dark Pattern';

  return (
    <div className="dark-pattern surface-opal opal-surface">
      <div className="dark-pattern__header">
        <span
          className="dark-pattern__shield"
          title="Potential dark pattern detected"
          aria-label="shield icon"
        >
          [!]
        </span>

        <div className="dark-pattern__body">
          <span className="dark-pattern__title">{topCategory} Detected</span>
          <p className="dark-pattern__reframe">{flag.reframe}</p>
          <div className="dark-pattern__meta">
            <span className="dark-pattern__confidence-label">
              {Math.round(flag.confidence * 100)}% confidence
            </span>
          </div>
        </div>

        <div className="dark-pattern__actions">
          <button
            type="button"
            className="dark-pattern__toggle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
          {onDismiss && (
            <button
              type="button"
              className="dark-pattern__dismiss"
              onClick={() => onDismiss(flag.contentId)}
              aria-label="dismiss flag"
            >
              x
            </button>
          )}
        </div>
      </div>

      {expanded && flag.patterns.length > 0 && (
        <div className="dark-pattern__details">
          {flag.patterns.map((pattern, idx) => (
            <div key={idx} className="dark-pattern__pattern">
              <span className="dark-pattern__category">
                {formatCategory(pattern.category)}:
              </span>
              <span>&ldquo;{pattern.evidence}&rdquo;</span>
              <span className="dark-pattern__confidence">
                {Math.round(pattern.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Dark Pattern Badge — Shield icon + reframe for flagged manipulative content.
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

// ─── Component ──────────────────────────────────────────────────────────────

export function DarkPatternBadge({ flag, onDismiss }: DarkPatternBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="dark-pattern">
      <div className="dark-pattern__header">
        <span
          className="dark-pattern__shield"
          title="Potential dark pattern detected"
          aria-label="shield icon"
        >
          [!]
        </span>
        <span className="dark-pattern__reframe">{flag.reframe}</span>
        <button
          className="dark-pattern__toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Why flagged?'}
        </button>
        {onDismiss && (
          <button
            className="dark-pattern__dismiss"
            onClick={() => onDismiss(flag.contentId)}
            aria-label="dismiss flag"
          >
            x
          </button>
        )}
      </div>

      {expanded && flag.patterns.length > 0 && (
        <div className="dark-pattern__details">
          {flag.patterns.map((pattern, idx) => (
            <div key={idx} className="dark-pattern__pattern">
              <span className="dark-pattern__category">{pattern.category}:</span>
              <span>&ldquo;{pattern.evidence}&rdquo;</span>
              <span className="dark-pattern__confidence">
                ({Math.round(pattern.confidence * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

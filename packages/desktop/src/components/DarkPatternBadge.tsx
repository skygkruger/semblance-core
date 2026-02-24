/**
 * Dark Pattern Badge — Shield icon + reframe for flagged manipulative content.
 *
 * Displayed next to email subjects or notifications that were flagged by DarkPatternDetector.
 * Shows "Why flagged?" expandable section and dismiss button.
 */

import { useState } from 'react';
import { Card, Button } from '@semblance/ui';

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
    <div className="space-y-1">
      {/* Shield icon + reframe */}
      <div className="flex items-center gap-2">
        <span
          className="text-semblance-alert flex-shrink-0"
          title="Potential dark pattern detected"
          aria-label="shield icon"
        >
          [!]
        </span>
        <span className="text-sm text-semblance-secondary italic">{flag.reframe}</span>
        <button
          className="text-xs text-semblance-muted underline ml-auto"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Why flagged?'}
        </button>
        {onDismiss && (
          <button
            className="text-xs text-semblance-muted hover:text-semblance-primary"
            onClick={() => onDismiss(flag.contentId)}
            aria-label="dismiss flag"
          >
            x
          </button>
        )}
      </div>

      {/* Expanded pattern details */}
      {expanded && flag.patterns.length > 0 && (
        <div className="ml-6 space-y-1 text-xs">
          {flag.patterns.map((pattern, idx) => (
            <div key={idx} className="flex gap-2 text-semblance-secondary">
              <span className="font-medium text-semblance-alert">{pattern.category}:</span>
              <span>"{pattern.evidence}"</span>
              <span className="text-semblance-muted">
                ({Math.round(pattern.confidence * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';

interface StyleScoreBreakdown {
  greeting: number;
  signoff: number;
  sentenceLength: number;
  formality: number;
  vocabulary: number;
}

interface StyleMatchIndicatorProps {
  /** Overall style match score (0-100), or null if profile is inactive */
  score: number | null;
  /** Score breakdown by dimension */
  breakdown?: StyleScoreBreakdown;
  /** When profile is inactive: number of emails analyzed so far */
  emailsAnalyzed?: number;
  /** Minimum emails needed for active profile */
  activationThreshold?: number;
}

/**
 * StyleMatchIndicator — Inline style match score display.
 * Shows "Matches your style: 87%" with color-coded indicator.
 * When profile is inactive, shows learning progress instead.
 */
export function StyleMatchIndicator({
  score,
  breakdown,
  emailsAnalyzed = 0,
  activationThreshold = 20,
}: StyleMatchIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  // Inactive profile — show learning progress
  if (score === null) {
    return (
      <div
        data-testid="style-match-indicator"
        data-state="learning"
        className="flex items-center gap-1.5 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark"
      >
        <span className="w-2 h-2 rounded-full bg-semblance-accent animate-pulse flex-shrink-0" />
        <span data-testid="style-learning-progress">
          Style learning in progress ({emailsAnalyzed}/{activationThreshold} emails)
        </span>
      </div>
    );
  }

  const colorClass = getScoreColor(score);
  const label = getScoreLabel(score);

  return (
    <div data-testid="style-match-indicator" data-state="active" className="text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:shadow-focus"
        data-testid="style-match-toggle"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colorClass}`} />
        <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          Matches your style: <span data-testid="style-match-score" className="font-medium">{score}%</span>
        </span>
        <span className="text-semblance-text-tertiary">{label}</span>
      </button>

      {expanded && breakdown && (
        <div
          data-testid="style-match-breakdown"
          className="mt-1.5 ml-3.5 space-y-1 text-semblance-text-secondary dark:text-semblance-text-secondary-dark"
        >
          <BreakdownRow label="Greeting" value={breakdown.greeting} />
          <BreakdownRow label="Sign-off" value={breakdown.signoff} />
          <BreakdownRow label="Sentence length" value={breakdown.sentenceLength} />
          <BreakdownRow label="Formality" value={breakdown.formality} />
          <BreakdownRow label="Vocabulary" value={breakdown.vocabulary} />
        </div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-semblance-text-tertiary">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-semblance-surface-2 dark:bg-semblance-surface-2-dark max-w-[80px]">
        <div
          className={`h-full rounded-full ${getScoreColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 text-right font-medium">{value}</span>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-semblance-success';
  if (score >= 60) return 'bg-semblance-accent';
  return 'bg-semblance-attention';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return '';
  if (score >= 60) return '';
  return '';
}

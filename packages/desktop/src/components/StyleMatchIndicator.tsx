import { useState } from 'react';
import './StyleMatchIndicator.css';

interface StyleScoreBreakdown {
  greeting: number;
  signoff: number;
  sentenceLength: number;
  formality: number;
  vocabulary: number;
}

interface StyleMatchIndicatorProps {
  score: number | null;
  breakdown?: StyleScoreBreakdown;
  emailsAnalyzed?: number;
  activationThreshold?: number;
}

export function StyleMatchIndicator({
  score,
  breakdown,
  emailsAnalyzed = 0,
  activationThreshold = 20,
}: StyleMatchIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  if (score === null) {
    return (
      <div data-testid="style-match-indicator" data-state="learning" className="style-match__learning">
        <span className="style-match__learning-dot" />
        <span data-testid="style-learning-progress">
          Style learning in progress ({emailsAnalyzed}/{activationThreshold} emails)
        </span>
      </div>
    );
  }

  const dotClass = score >= 80 ? 'style-match__dot--high' : score >= 60 ? 'style-match__dot--medium' : 'style-match__dot--low';

  return (
    <div data-testid="style-match-indicator" data-state="active" className="style-match">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="style-match__toggle"
        data-testid="style-match-toggle"
      >
        <span className={`style-match__dot ${dotClass}`} />
        <span className="style-match__label">
          Matches your style: <span data-testid="style-match-score" className="style-match__score">{score}%</span>
        </span>
      </button>

      {expanded && breakdown && (
        <div data-testid="style-match-breakdown" className="style-match__breakdown">
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
  const fillClass = value >= 80 ? 'style-match__dot--high' : value >= 60 ? 'style-match__dot--medium' : 'style-match__dot--low';

  return (
    <div className="style-match__breakdown-row">
      <span className="style-match__breakdown-label">{label}</span>
      <div className="style-match__breakdown-bar">
        <div className={`style-match__breakdown-fill ${fillClass}`} style={{ width: `${value}%` }} />
      </div>
      <span className="style-match__breakdown-value">{value}</span>
    </div>
  );
}

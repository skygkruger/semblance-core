import type { ToolStepCardProps } from './ToolStepCard.types';
import './ToolStepCard.css';

const STATUS_DOT_COLORS: Record<ToolStepCardProps['status'], string> = {
  pending: '#5E6B7C',
  active: '#818CF8',
  complete: '#6ECFA3',
  error: '#E8657A',
};

export function ToolStepCard({
  displayName,
  status,
  summary,
  duration,
  className = '',
}: ToolStepCardProps) {
  const dotColor = STATUS_DOT_COLORS[status];

  return (
    <div className={`tool-step tool-step--${status} ${className}`.trim()}>
      {/* Status dot */}
      <span className="tool-step__dot" style={{ background: dotColor }}>
        {status === 'active' && (
          <span className="tool-step__dot-pulse" style={{ borderColor: dotColor }} />
        )}
      </span>

      {/* Label — flashes Veridian on completion */}
      <span className="tool-step__name">{displayName}</span>

      {/* Summary text */}
      {summary && <span className="tool-step__summary">{summary}</span>}

      {/* Spinner for active state */}
      {status === 'active' && (
        <svg className="tool-step__spinner" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      )}

      {/* Duration on completion */}
      {duration !== undefined && status === 'complete' && (
        <span className="tool-step__duration">{formatDuration(duration)}</span>
      )}

      {/* Error indicator */}
      {status === 'error' && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E8657A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

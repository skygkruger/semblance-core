import type { ProgressBarProps } from './ProgressBar.types';
import './ProgressBar.css';

export function ProgressBar({ value = 0, max = 100, indeterminate = false, className = '' }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const isComplete = !indeterminate && percentage >= 100;

  return (
    <div
      className={`progress-bar ${isComplete ? 'progress-bar--complete' : ''} ${className}`}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {indeterminate ? (
        <div className="progress-bar__fill progress-bar__fill--indeterminate" />
      ) : (
        <div
          className={`progress-bar__fill ${percentage >= 100 ? 'progress-bar__fill--complete' : ''}`}
          style={{ width: `${percentage}%` }}
        />
      )}
    </div>
  );
}

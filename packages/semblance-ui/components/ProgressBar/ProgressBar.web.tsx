import type { ProgressBarProps } from './ProgressBar.types';

export function ProgressBar({ value = 0, max = 100, indeterminate = false, className = '' }: ProgressBarProps) {
  const percentage = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div
      className={`w-full h-2 bg-semblance-surface-2 dark:bg-semblance-surface-2-dark rounded-full overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {indeterminate ? (
        <div className="h-full bg-semblance-primary rounded-full animate-loading-pulse w-1/2" />
      ) : (
        <div
          className="h-full bg-semblance-primary rounded-full transition-all duration-normal ease-out"
          style={{ width: `${percentage}%` }}
        />
      )}
    </div>
  );
}

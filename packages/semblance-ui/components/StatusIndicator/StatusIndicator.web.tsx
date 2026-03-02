import type { StatusIndicatorProps } from './StatusIndicator.types';
import './StatusIndicator.css';

export function StatusIndicator({ status, pulse = false, className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`status-indicator status-indicator--${status} ${pulse ? 'status-indicator--pulse' : ''} ${className}`.trim()}
      role="status"
      aria-label={`Status: ${status}`}
    />
  );
}

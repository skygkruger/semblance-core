import './StatusIndicator.css';

interface StatusIndicatorProps {
  status: 'success' | 'accent' | 'attention' | 'muted';
  pulse?: boolean;
  className?: string;
}

export function StatusIndicator({ status, pulse = false, className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`status-indicator status-indicator--${status} ${pulse ? 'status-indicator--pulse' : ''} ${className}`.trim()}
      role="status"
      aria-label={`Status: ${status}`}
    />
  );
}

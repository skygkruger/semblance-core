interface StatusIndicatorProps {
  status: 'success' | 'accent' | 'attention' | 'muted';
  pulse?: boolean;
  className?: string;
}

const statusColors: Record<StatusIndicatorProps['status'], string> = {
  success: 'bg-semblance-success',
  accent: 'bg-semblance-accent',
  attention: 'bg-semblance-attention',
  muted: 'bg-semblance-muted',
};

export function StatusIndicator({ status, pulse = false, className = '' }: StatusIndicatorProps) {
  return (
    <span
      className={`
        inline-block w-2 h-2 rounded-full
        ${statusColors[status]}
        ${pulse ? 'animate-status-pulse' : ''}
        ${className}
      `.trim()}
      role="status"
      aria-label={`Status: ${status}`}
    />
  );
}

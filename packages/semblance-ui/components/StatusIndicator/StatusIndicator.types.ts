export type IndicatorStatus = 'success' | 'accent' | 'attention' | 'muted';

export interface StatusIndicatorProps {
  status: IndicatorStatus;
  pulse?: boolean;
  className?: string;
}

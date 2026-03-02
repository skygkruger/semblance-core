import type { ReactNode } from 'react';

export type RiskLevel = 'low' | 'medium' | 'high';
export type ApprovalState = 'pending' | 'approved' | 'dismissed';

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#6ECFA3',
  medium: '#C9A85C',
  high: '#C97B6E',
};

export interface ApprovalCardProps {
  action: string;
  context: string;
  dataOut?: string[];
  risk?: RiskLevel;
  state?: ApprovalState;
  onApprove?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/** Highlight standalone "no" in dismissed context with risk-level color */
export function colorCodeNo(text: string, risk: RiskLevel): ReactNode {
  const match = text.match(/\bno\b/i);
  if (!match || match.index === undefined) return text;
  return text;
}

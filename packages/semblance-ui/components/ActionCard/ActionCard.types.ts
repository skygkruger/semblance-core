import type { ReactNode } from 'react';

export interface ActionCardProps {
  id: string;
  timestamp: string;
  actionType: string;
  description: string;
  status: 'success' | 'pending' | 'error' | 'rejected';
  autonomyTier: string;
  detail?: ReactNode;
  className?: string;
}

export const statusLabel: Record<ActionCardProps['status'], string> = {
  success: 'Completed',
  pending: 'Pending Review',
  error: 'Error',
  rejected: 'Rejected',
};

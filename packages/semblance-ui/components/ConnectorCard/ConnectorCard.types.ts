import type { ReactNode } from 'react';

export type ConnectorCardStatus = 'connected' | 'disconnected' | 'error' | 'pending';

export interface ConnectorCardProps {
  id: string;
  displayName: string;
  description: string;
  status: ConnectorCardStatus;
  isPremium: boolean;
  platform: 'all' | 'macos' | 'windows' | 'linux';
  userEmail?: string;
  lastSyncedAt?: string;
  icon?: ReactNode;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
}

export const statusConfig: Record<ConnectorCardStatus, { label: string; dotColor: string; textColor: string }> = {
  connected: {
    label: 'Connected',
    dotColor: '#6ECFA3',
    textColor: '#6ECFA3',
  },
  disconnected: {
    label: 'Available',
    dotColor: '#8593A4',
    textColor: '#8593A4',
  },
  error: {
    label: 'Error',
    dotColor: '#C97B6E',
    textColor: '#C97B6E',
  },
  pending: {
    label: 'Connecting...',
    dotColor: '#C9A85C',
    textColor: '#C9A85C',
  },
};

export function formatLastSynced(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

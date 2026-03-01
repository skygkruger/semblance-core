/**
 * ConnectorCard — Displays a single connector with its status and actions.
 *
 * Used in the ConnectionsScreen to show each available service/import connector.
 * Follows the Semblance Trellis design system.
 */

import type { ReactNode } from 'react';
import './ConnectorCard.css';

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

const statusConfig: Record<ConnectorCardStatus, { label: string; dotColor: string; textColor: string }> = {
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

function formatLastSynced(isoString: string): string {
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

export function ConnectorCard({
  id,
  displayName,
  description,
  status,
  isPremium,
  userEmail,
  lastSyncedAt,
  icon,
  onConnect,
  onDisconnect,
  onSync,
}: ConnectorCardProps) {
  const { label: statusLabel, dotColor, textColor } = statusConfig[status];
  const isConnected = status === 'connected';
  const isPending = status === 'pending';

  const rootClass = `connector-card${isConnected ? ' connector-card--connected' : ''}`;

  return (
    <div className={rootClass} data-testid={`connector-card-${id}`}>
      <div className="connector-card__top">
        <div className="connector-card__info">
          {icon && (
            <div className="connector-card__icon">
              {icon}
            </div>
          )}
          <div className="connector-card__text">
            <div className="connector-card__name-row">
              <h3 className="connector-card__name">{displayName}</h3>
              {isPremium && (
                <span className="connector-card__dr-badge">DR</span>
              )}
            </div>
            <p className="connector-card__description">{description}</p>
          </div>
        </div>

        <div className="connector-card__actions">
          {!isConnected && !isPending && (
            <button
              type="button"
              className="connector-card__btn connector-card__btn--connect"
              onClick={() => onConnect(id)}
            >
              Connect
            </button>
          )}
          {isConnected && (
            <>
              <button
                type="button"
                className="connector-card__btn connector-card__btn--sync"
                onClick={() => onSync(id)}
              >
                Sync
              </button>
              <button
                type="button"
                className="connector-card__btn connector-card__btn--disconnect"
                onClick={() => onDisconnect(id)}
              >
                Disconnect
              </button>
            </>
          )}
          {isPending && (
            <span className="connector-card__pending-text">Connecting...</span>
          )}
        </div>
      </div>

      <div className="connector-card__status">
        <div className="connector-card__status-left">
          <span
            className="connector-card__status-dot"
            style={{ backgroundColor: dotColor }}
          />
          <span style={{ color: textColor }}>{statusLabel}</span>
          {isConnected && userEmail && (
            <span className="connector-card__status-email">{userEmail}</span>
          )}
        </div>
        {isConnected && lastSyncedAt && (
          <span className="connector-card__status-sync">
            Synced {formatLastSynced(lastSyncedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * ConnectorCard — Displays a single connector with its status and actions.
 *
 * Used in the ConnectionsScreen to show each available service/import connector.
 * Follows the Semblance Trellis design system.
 */

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

const statusConfig: Record<ConnectorCardStatus, { label: string; dotColor: string; textColor: string }> = {
  connected: {
    label: 'Connected',
    dotColor: '#6ECFA3',    // Veridian
    textColor: '#6ECFA3',
  },
  disconnected: {
    label: 'Not connected',
    dotColor: '#8593A4',    // Silver
    textColor: '#8593A4',
  },
  error: {
    label: 'Error',
    dotColor: '#C97B6E',    // Rust
    textColor: '#C97B6E',
  },
  pending: {
    label: 'Connecting...',
    dotColor: '#C9A85C',    // Amber
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

  return (
    <div
      className="opal-surface rounded-lg p-4 border border-transparent hover:border-semblance-border dark:hover:border-semblance-border-dark transition-colors duration-150"
      data-testid={`connector-card-${id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-semblance-surface-2 dark:bg-semblance-surface-2-dark">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-semblance-text dark:text-semblance-text-dark truncate">
                {displayName}
              </h3>
              {isPremium && (
                <span
                  className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: '#C9A85C22', color: '#C9A85C' }}
                >
                  DR
                </span>
              )}
            </div>
            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-0.5 line-clamp-2">
              {description}
            </p>
          </div>
        </div>

        <div className="flex-shrink-0">
          {!isConnected && !isPending && (
            <button
              type="button"
              onClick={() => onConnect(id)}
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
              style={{
                backgroundColor: '#6ECFA318',
                color: '#6ECFA3',
              }}
            >
              Connect
            </button>
          )}
          {isConnected && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSync(id)}
                className="text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors"
                style={{
                  backgroundColor: '#8593A418',
                  color: '#8593A4',
                }}
              >
                Sync
              </button>
              <button
                type="button"
                onClick={() => onDisconnect(id)}
                className="text-xs px-2.5 py-1.5 rounded-md font-medium transition-colors"
                style={{
                  backgroundColor: '#C97B6E18',
                  color: '#C97B6E',
                }}
              >
                Disconnect
              </button>
            </div>
          )}
          {isPending && (
            <span className="text-xs" style={{ color: '#C9A85C' }}>
              Connecting...
            </span>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="mt-3 pt-2 border-t border-semblance-border/30 dark:border-semblance-border-dark/30 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          <span style={{ color: textColor }}>{statusLabel}</span>
          {isConnected && userEmail && (
            <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark ml-1">
              {userEmail}
            </span>
          )}
        </div>
        {isConnected && lastSyncedAt && (
          <span className="text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            Synced {formatLastSynced(lastSyncedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

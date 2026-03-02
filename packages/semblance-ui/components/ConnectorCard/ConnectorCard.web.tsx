import type { ConnectorCardProps } from './ConnectorCard.types';
import { statusConfig, formatLastSynced } from './ConnectorCard.types';
import './ConnectorCard.css';

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

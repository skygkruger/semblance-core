import './Settings.css';
import { BackArrow, ChevronRight } from './SettingsIcons';

interface ConnectionEntry {
  id: string;
  name: string;
  category: string;
  categoryColor: string;
  isConnected: boolean;
  lastSync: string | null;
  entityCount: number;
}

interface SettingsConnectionsProps {
  connections: ConnectionEntry[];
  onManageAll: () => void;
  onConnectionTap: (id: string) => void;
  onBack: () => void;
}

export function SettingsConnections({
  connections,
  onManageAll,
  onConnectionTap,
  onBack,
}: SettingsConnectionsProps) {
  const connected = connections.filter((c) => c.isConnected);
  const disconnected = connections.filter((c) => !c.isConnected);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Connections</h1>
      </div>

      <div className="settings-content">
        {connected.length > 0 && (
          <>
            <div className="settings-section-header">Connected</div>
            {connected.map((conn) => (
              <button
                key={conn.id}
                type="button"
                className="settings-row"
                onClick={() => onConnectionTap(conn.id)}
              >
                <span
                  className="settings-row__dot settings-row__dot--connected"
                  style={{ background: conn.categoryColor }}
                />
                <span className="settings-row__label">{conn.name}</span>
                <span className="settings-row__value">
                  {conn.entityCount} items{conn.lastSync ? ` · ${conn.lastSync}` : ''}
                </span>
                <span className="settings-row__chevron"><ChevronRight /></span>
              </button>
            ))}
          </>
        )}

        {disconnected.length > 0 && (
          <>
            <div className="settings-section-header">Not Connected</div>
            {disconnected.map((conn) => (
              <div key={conn.id} className="settings-row settings-row--static">
                <span className="settings-row__dot settings-row__dot--disconnected" />
                <span className="settings-row__label" style={{ color: '#5E6B7C' }}>{conn.name}</span>
                <span className="settings-row__value">Not connected</span>
              </div>
            ))}
          </>
        )}

        {connections.length === 0 && (
          <p className="settings-explanation" style={{ paddingTop: 20 }}>
            No data sources configured yet. Connect your email, calendar, and other services to get started.
          </p>
        )}

        <div style={{ padding: '20px 16px 0' }}>
          <button type="button" className="settings-ghost-button" onClick={onManageAll}>
            Manage all connections
          </button>
        </div>
      </div>
    </div>
  );
}

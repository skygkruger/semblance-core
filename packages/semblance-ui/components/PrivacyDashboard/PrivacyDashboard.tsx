import { ActionLogItem } from '../ActionLogItem/ActionLogItem';
import './PrivacyDashboard.css';

interface NetworkEntry {
  label: string;
  value: string;
  isZero?: boolean;
}

interface AuditEntry {
  status: 'completed' | 'pending' | 'failed' | 'undone';
  text: string;
  domain?: string;
  timestamp?: string;
}

interface PrivacyDashboardProps {
  dataSources?: number;
  cloudConnections?: number;
  actionsLogged?: number;
  timeSavedHours?: number;
  networkEntries?: NetworkEntry[];
  auditEntries?: AuditEntry[];
  proofVerified?: boolean;
  className?: string;
}

export function PrivacyDashboard({
  dataSources = 0,
  cloudConnections = 0,
  actionsLogged = 0,
  timeSavedHours = 0,
  networkEntries = [],
  auditEntries = [],
  proofVerified = false,
  className = '',
}: PrivacyDashboardProps) {
  return (
    <div className={`privacy-dashboard ${className}`.trim()}>
      {/* Comparison Statement */}
      <div className="privacy-dashboard__section">
        <h3 className="privacy-dashboard__section-title">Comparison Statement</h3>
        <div className="privacy-dashboard__comparison">
          <div className="privacy-dashboard__stat">
            <span className="privacy-dashboard__stat-value">{dataSources}</span>
            <span className="privacy-dashboard__stat-label">Data Sources</span>
          </div>
          <div className="privacy-dashboard__stat">
            <span className={`privacy-dashboard__stat-value ${cloudConnections === 0 ? 'privacy-dashboard__stat-value--veridian' : ''}`}>
              {cloudConnections}
            </span>
            <span className="privacy-dashboard__stat-label">Cloud Connections</span>
          </div>
          <div className="privacy-dashboard__stat">
            <span className="privacy-dashboard__stat-value">{actionsLogged}</span>
            <span className="privacy-dashboard__stat-label">Actions Logged</span>
          </div>
          <div className="privacy-dashboard__stat">
            <span className="privacy-dashboard__stat-value">{timeSavedHours}h</span>
            <span className="privacy-dashboard__stat-label">Time Saved</span>
          </div>
        </div>
        <div className="privacy-dashboard__divider" />
      </div>

      {/* Network Activity */}
      {networkEntries.length > 0 && (
        <div className="privacy-dashboard__section">
          <h3 className="privacy-dashboard__section-title">Network Activity</h3>
          {networkEntries.map((entry, i) => (
            <div key={i} className="privacy-dashboard__network-row">
              <span className="privacy-dashboard__network-label">{entry.label}</span>
              <span className={`privacy-dashboard__network-value ${entry.isZero ? 'privacy-dashboard__network-value--zero' : ''}`}>
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Audit Trail */}
      {auditEntries.length > 0 && (
        <div className="privacy-dashboard__section">
          <h3 className="privacy-dashboard__section-title">Recent Audit Trail</h3>
          {auditEntries.map((entry, i) => (
            <ActionLogItem
              key={i}
              status={entry.status}
              text={entry.text}
              domain={entry.domain}
              timestamp={entry.timestamp}
            />
          ))}
        </div>
      )}

      {/* Proof of Privacy */}
      {proofVerified && (
        <div className="privacy-dashboard__section">
          <h3 className="privacy-dashboard__section-title">Proof of Privacy</h3>
          <div className="privacy-dashboard__proof">
            <svg className="privacy-dashboard__proof-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="privacy-dashboard__proof-text">
              Zero unauthorized network connections verified
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

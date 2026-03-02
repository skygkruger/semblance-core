import { useTranslation } from 'react-i18next';
import { ActionLogItem } from '../ActionLogItem/ActionLogItem';
import type { PrivacyDashboardProps } from './PrivacyDashboard.types';
import './PrivacyDashboard.css';

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
  const { t } = useTranslation('privacy');

  return (
    <div className={`privacy-dashboard ${className}`.trim()}>
      {/* Comparison Statement */}
      <div className="privacy-dashboard__section">
        <h3 className="privacy-dashboard__section-title">{t('dashboard.section_comparison')}</h3>
        <div className="privacy-dashboard__comparison">
          <div className="privacy-dashboard__stat">
            <span className="privacy-dashboard__stat-value">{dataSources}</span>
            <span className="privacy-dashboard__stat-label">{t('dashboard.comparison.local_data_points')}</span>
          </div>
          <div className="privacy-dashboard__stat">
            <span className={`privacy-dashboard__stat-value ${cloudConnections === 0 ? 'privacy-dashboard__stat-value--veridian' : ''}`}>
              {cloudConnections}
            </span>
            <span className="privacy-dashboard__stat-label">{t('dashboard.comparison.cloud_competitor_points')}</span>
          </div>
          <div className="privacy-dashboard__stat">
            <span className="privacy-dashboard__stat-value">{actionsLogged}</span>
            <span className="privacy-dashboard__stat-label">{t('dashboard.comparison.actions_logged')}</span>
          </div>
          <div className="privacy-dashboard__stat">
            <span className="privacy-dashboard__stat-value">{timeSavedHours}h</span>
            <span className="privacy-dashboard__stat-label">{t('dashboard.comparison.actions_reversible')}</span>
          </div>
        </div>
        <div className="privacy-dashboard__divider" />
      </div>

      {/* Network Activity */}
      {networkEntries.length > 0 && (
        <div className="privacy-dashboard__section">
          <h3 className="privacy-dashboard__section-title">{t('dashboard.section_network_activity')}</h3>
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
          <h3 className="privacy-dashboard__section-title">{t('dashboard.section_audit_trail')}</h3>
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
          <h3 className="privacy-dashboard__section-title">{t('dashboard.proof_of_privacy.title')}</h3>
          <div className="privacy-dashboard__proof">
            <svg className="privacy-dashboard__proof-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="privacy-dashboard__proof-text">
              {t('dashboard.proof_of_privacy.verified_text')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

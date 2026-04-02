import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import {
  EnvelopeIcon,
  CalendarIcon,
  FolderIcon,
  PersonIcon,
  HeartIcon,
  ChatIcon,
} from '../../components/ConnectionsScreen/ConnectorIcons';
import type { DataSource, DataSourcesStepProps, DataSourceStatus } from './DataSourcesStep.types';
import './DataSourcesStep.css';

function ShieldIcon() {
  return (
    <svg className="datasources__privacy-icon" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      <path d="M6 8l1.5 1.5L10 6" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="7" cy="7" r="5.5" stroke="#6ECFA3" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="20 10" />
    </svg>
  );
}

export function DataSourcesStep({
  initialConnected = new Set(),
  sourceStatuses = {},
  onConnectSource,
  onContinue,
  onSkip,
  onBack,
}: DataSourcesStepProps) {
  const { t } = useTranslation('onboarding');
  const [connected, setConnected] = useState<Set<string>>(new Set(initialConnected));
  const [showNudge, setShowNudge] = useState(false);

  const SOURCES: DataSource[] = [
    { id: 'email',    name: t('data_sources.sources.email.name'),    description: t('data_sources.sources.email.description'),    icon: EnvelopeIcon, connectorId: 'gmail' },
    { id: 'calendar', name: t('data_sources.sources.calendar.name'), description: t('data_sources.sources.calendar.description'), icon: CalendarIcon, connectorId: 'google-calendar' },
    { id: 'files',    name: t('data_sources.sources.files.name'),    description: t('data_sources.sources.files.description'),    icon: FolderIcon, connectorId: 'files' },
    { id: 'contacts', name: t('data_sources.sources.contacts.name'), description: t('data_sources.sources.contacts.description'), icon: PersonIcon, connectorId: 'contacts' },
    { id: 'health',   name: t('data_sources.sources.health.name'),   description: t('data_sources.sources.health.description'),   icon: HeartIcon, connectorId: null },
    { id: 'slack',    name: t('data_sources.sources.slack.name'),    description: t('data_sources.sources.slack.description'),    icon: ChatIcon, connectorId: 'slack-oauth' },
  ];

  const handleConnect = useCallback((source: DataSource) => {
    if (source.connectorId && onConnectSource) {
      // Fire real OAuth flow
      onConnectSource(source.id, source.connectorId);
    } else {
      // Non-OAuth source: toggle local state
      setConnected(prev => {
        const next = new Set(prev);
        if (next.has(source.id)) {
          next.delete(source.id);
        } else {
          next.add(source.id);
        }
        return next;
      });
    }
    setShowNudge(false);
  }, [onConnectSource]);

  // Merge real statuses with local toggles
  const getStatus = (source: DataSource): DataSourceStatus => {
    const realStatus = sourceStatuses[source.id];
    if (realStatus) return realStatus;
    if (connected.has(source.id)) return 'connected';
    return 'disconnected';
  };

  const getConnectedIds = (): string[] => {
    const ids: string[] = [];
    for (const source of SOURCES) {
      const status = getStatus(source);
      if (status === 'connected') ids.push(source.id);
    }
    return ids;
  };

  const handleContinue = useCallback(() => {
    const connectedIds = getConnectedIds();
    if (connectedIds.length === 0) {
      setShowNudge(true);
      return;
    }
    onContinue?.(connectedIds);
  }, [connected, sourceStatuses, onContinue]);

  return (
    <div className="datasources">
      <h2 className="datasources__headline">{t('data_sources.headline')}</h2>
      <p className="datasources__subtext">
        {t('data_sources.subtext')}
      </p>

      <div className="onboarding-content-frame">
        <div className="datasources__grid">
          {SOURCES.map((source, i) => {
            const status = getStatus(source);
            const isConnected = status === 'connected';
            const isConnecting = status === 'connecting';
            const isError = status === 'error';
            const Icon = source.icon;
            return (
              <div
                key={source.id}
                className={`datasources__card${isConnected ? ' datasources__card--connected' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="datasources__card-info">
                  <div className="datasources__card-icon">
                    <Icon size={16} />
                  </div>
                  <div className="datasources__card-text">
                    <p className="datasources__card-name">{source.name}</p>
                    <p className="datasources__card-desc">{source.description}</p>
                  </div>
                </div>
                {isConnected ? (
                  <span className="datasources__card-status">
                    <span className="datasources__card-status-dot" />
                    {t('data_sources.connected_label')}
                  </span>
                ) : isConnecting ? (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: 12,
                    color: '#6ECFA3',
                  }}>
                    <SpinnerIcon />
                    {t('data_sources.connecting_label')}
                  </span>
                ) : isError ? (
                  <Button variant="ghost" size="sm" onClick={() => handleConnect(source)}>
                    {t('data_sources.retry_button')}
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleConnect(source)}>
                    {t('data_sources.connect_button')}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="datasources__more">
          {t('data_sources.more_sources')}
        </p>

        <div className="datasources__privacy">
          <ShieldIcon />
          <span className="datasources__privacy-text">
            {t('data_sources.privacy_notice')}
          </span>
        </div>
      </div>

      {showNudge && (
        <p className="datasources__nudge">
          {t('data_sources.nudge')}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <Button variant="opal" size="lg" onClick={handleContinue}>
          <span className="btn__text">{t('data_sources.continue_button')}</span>
        </Button>
        <button
          type="button"
          onClick={onSkip}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'DM Mono', monospace",
            fontSize: 12,
            color: '#5E6B7C',
            letterSpacing: '0.04em',
            padding: '4px 8px',
            transition: 'color 200ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#A8B4C0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#5E6B7C')}
        >
          {t('data_sources.skip_button')}
        </button>
      </div>
    </div>
  );
}

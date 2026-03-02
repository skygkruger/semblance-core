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
import type { DataSource, DataSourcesStepProps } from './DataSourcesStep.types';
import './DataSourcesStep.css';

function ShieldIcon() {
  return (
    <svg className="datasources__privacy-icon" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5L2.5 4v4c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V4L8 1.5z" />
      <path d="M6 8l1.5 1.5L10 6" />
    </svg>
  );
}

export function DataSourcesStep({
  initialConnected = new Set(),
  onContinue,
  onSkip,
}: DataSourcesStepProps) {
  const { t } = useTranslation('onboarding');
  const [connected, setConnected] = useState<Set<string>>(new Set(initialConnected));
  const [showNudge, setShowNudge] = useState(false);

  const SOURCES: DataSource[] = [
    { id: 'email',    name: t('data_sources.sources.email.name'),    description: t('data_sources.sources.email.description'),    icon: EnvelopeIcon },
    { id: 'calendar', name: t('data_sources.sources.calendar.name'), description: t('data_sources.sources.calendar.description'), icon: CalendarIcon },
    { id: 'files',    name: t('data_sources.sources.files.name'),    description: t('data_sources.sources.files.description'),    icon: FolderIcon },
    { id: 'contacts', name: t('data_sources.sources.contacts.name'), description: t('data_sources.sources.contacts.description'), icon: PersonIcon },
    { id: 'health',   name: t('data_sources.sources.health.name'),   description: t('data_sources.sources.health.description'),   icon: HeartIcon },
    { id: 'slack',    name: t('data_sources.sources.slack.name'),    description: t('data_sources.sources.slack.description'),    icon: ChatIcon },
  ];

  const toggleConnect = useCallback((id: string) => {
    setConnected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setShowNudge(false);
  }, []);

  const handleContinue = useCallback(() => {
    if (connected.size === 0) {
      setShowNudge(true);
      return;
    }
    onContinue?.(Array.from(connected));
  }, [connected, onContinue]);

  return (
    <div className="datasources">
      <h2 className="datasources__headline">{t('data_sources.headline')}</h2>
      <p className="datasources__subtext">
        {t('data_sources.subtext')}
      </p>

      <div className="datasources__grid">
        {SOURCES.map((source, i) => {
          const isConnected = connected.has(source.id);
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
                  {t('data_sources.connected_status')}
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => toggleConnect(source.id)}>
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

      {showNudge && (
        <p className="datasources__nudge">
          {t('data_sources.nudge')}
        </p>
      )}

      <div className="datasources__actions">
        <button
          type="button"
          className="datasources__skip"
          onClick={onSkip}
        >
          {t('data_sources.skip_button')}
        </button>
        <Button variant="approve" size="md" onClick={handleContinue}>
          {t('data_sources.continue_button')}
        </Button>
      </div>
    </div>
  );
}

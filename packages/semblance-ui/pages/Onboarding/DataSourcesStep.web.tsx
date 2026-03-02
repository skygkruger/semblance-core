import { useState, useCallback } from 'react';
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

const SOURCES: DataSource[] = [
  { id: 'email',    name: 'Email',             description: 'Gmail, Outlook, IMAP',    icon: EnvelopeIcon },
  { id: 'calendar', name: 'Calendar',          description: 'Google, Apple, Outlook',   icon: CalendarIcon },
  { id: 'files',    name: 'Files & Documents', description: 'Local folders, iCloud',    icon: FolderIcon },
  { id: 'contacts', name: 'Contacts',          description: 'Phone, Google, CardDAV',   icon: PersonIcon },
  { id: 'health',   name: 'Health',            description: 'Apple Health, Google Fit',  icon: HeartIcon },
  { id: 'slack',    name: 'Slack',             description: 'Workspace messages',       icon: ChatIcon },
];

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
  const [connected, setConnected] = useState<Set<string>>(new Set(initialConnected));
  const [showNudge, setShowNudge] = useState(false);

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
      <h2 className="datasources__headline">Connect your world</h2>
      <p className="datasources__subtext">
        Everything stays on this device. Semblance connects to your accounts
        through the Gateway, fetches your data, and stores it locally.
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
                  Connected
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => toggleConnect(source.id)}>
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <p className="datasources__more">
        + 42 more sources available in Connections after setup
      </p>

      <div className="datasources__privacy">
        <ShieldIcon />
        <span className="datasources__privacy-text">
          Your data never leaves this device. Connections are encrypted and
          revocable at any time.
        </span>
      </div>

      {showNudge && (
        <p className="datasources__nudge">
          Connecting at least one source helps Semblance understand your world.
          You can always add more later.
        </p>
      )}

      <div className="datasources__actions">
        <button
          type="button"
          className="datasources__skip"
          onClick={onSkip}
        >
          Skip for now
        </button>
        <Button variant="approve" size="md" onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

/**
 * ConnectionsScreen -- Full-page screen showing all available connectors
 * grouped into three sections: Native, Connected Services (OAuth), Manual Imports.
 */

import { useTranslation } from 'react-i18next';
import { ConnectorCard } from '../ConnectorCard/ConnectorCard';
import {
  EnvelopeIcon,
  CalendarIcon,
  PersonIcon,
  HeartIcon,
  ChatIcon,
  MusicIcon,
  CodeIcon,
  FolderIcon,
  DollarIcon,
  GlobeIcon,
  FileUpIcon,
  LinkIcon,
  PhotoIcon,
  MapPinIcon,
} from './ConnectorIcons';
import type { ReactNode } from 'react';
import type { ConnectionsScreenProps } from './ConnectionsScreen.types';
import { SECTION_CONFIG } from './ConnectionsScreen.types';
import './ConnectionsScreen.css';

const ICON_MAP: Record<string, (props: { size?: number }) => ReactNode> = {
  email: EnvelopeIcon,
  calendar: CalendarIcon,
  contacts: PersonIcon,
  health: HeartIcon,
  messages: ChatIcon,
  music: MusicIcon,
  code: CodeIcon,
  files: FolderIcon,
  finance: DollarIcon,
  browser: GlobeIcon,
  import: FileUpIcon,
  link: LinkIcon,
  photos: PhotoIcon,
  location: MapPinIcon,
};

function getIcon(iconType?: string): ReactNode {
  const IconComp = iconType ? ICON_MAP[iconType] : undefined;
  if (IconComp) return <IconComp size={16} />;
  return <LinkIcon size={16} />;
}

export function ConnectionsScreen({
  connectors,
  onConnect,
  onDisconnect,
  onSync,
}: ConnectionsScreenProps) {
  const { t } = useTranslation('connections');
  const hasAny = connectors.length > 0;
  const connectedCount = connectors.filter((c) => c.status === 'connected').length;

  if (!hasAny) {
    return (
      <div className="connections-screen">
        <h1 className="connections-screen__title">{t('title')}</h1>
        <p className="connections-screen__subtitle">
          {t('subtitle_empty')}
        </p>
        <div className="connections-empty">
          <LinkIcon size={48} />
          <h2 className="connections-empty__heading">{t('empty.heading')}</h2>
          <p className="connections-empty__body">
            {t('empty.body')}
          </p>
          <div className="connections-empty__actions">
            <button
              type="button"
              className="connections-empty__btn"
              onClick={() => onConnect('email')}
            >
              {t('empty.btn_email')}
            </button>
            <button
              type="button"
              className="connections-empty__btn"
              onClick={() => onConnect('calendar')}
            >
              {t('empty.btn_calendar')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="connections-screen">
      <h1 className="connections-screen__title">{t('title')}</h1>
      <p className="connections-screen__subtitle">
        {t('subtitle_count', { connected: connectedCount, total: connectors.length })}
      </p>

      {SECTION_CONFIG.map(({ key }) => {
        const sectionConnectors = connectors.filter((c) => c.category === key);
        if (sectionConnectors.length === 0) return null;

        return (
          <div key={key} className="connections-section">
            <h2 className="connections-section__header">{t(`section_headers.${key}`)}</h2>
            <div className="connections-section__grid">
              {sectionConnectors.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  id={connector.id}
                  displayName={connector.displayName}
                  description={connector.description}
                  status={connector.status}
                  isPremium={connector.isPremium}
                  platform={connector.platform}
                  userEmail={connector.userEmail}
                  lastSyncedAt={connector.lastSyncedAt}
                  icon={getIcon(connector.iconType)}
                  onConnect={onConnect}
                  onDisconnect={onDisconnect}
                  onSync={onSync}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

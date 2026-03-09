import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './BackupScreen.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BackupDestination {
  id: string;
  name: string;
  type: 'local' | 'usb' | 'network';
  path: string;
  lastBackupAt: string | null;
  sizeBytes: number;
}

interface BackupHistoryEntry {
  id: string;
  destinationId: string;
  destinationName: string;
  timestamp: string;
  sizeBytes: number;
  status: 'success' | 'failed' | 'partial';
  durationSeconds: number;
}

type BackupSchedule = 'manual' | 'daily' | 'weekly' | 'monthly';

// ─── Component ──────────────────────────────────────────────────────────────

export function BackupScreen() {
  const { t } = useTranslation();
  const [destinations] = useState<BackupDestination[]>([]);
  const [history] = useState<BackupHistoryEntry[]>([]);
  const [lastBackupAt] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<BackupSchedule>('manual');
  const [isBackingUp] = useState(false);

  const scheduleOptions: { value: BackupSchedule; label: string }[] = [
    { value: 'manual', label: t('screen.backup.schedule_manual') },
    { value: 'daily', label: t('screen.backup.schedule_daily') },
    { value: 'weekly', label: t('screen.backup.schedule_weekly') },
    { value: 'monthly', label: t('screen.backup.schedule_monthly') },
  ];

  return (
    <div className="backup-screen h-full overflow-y-auto">
      <div className="backup-screen__container">
        <h1 className="backup-screen__title">{t('screen.backup.title')}</h1>
        <p className="backup-screen__subtitle">
          {t('screen.backup.subtitle')}
        </p>

        {/* Status card */}
        <div className="backup-screen__card surface-void opal-wireframe">
          <div className="backup-screen__card-header">
            <h2 className="backup-screen__card-title">{t('screen.backup.status')}</h2>
          </div>
          <div className="backup-screen__status-row">
            <span className="backup-screen__label">{t('screen.backup.last_backup')}</span>
            <span className="backup-screen__value">
              {lastBackupAt ?? t('screen.backup.never')}
            </span>
          </div>
          <div className="backup-screen__status-row">
            <span className="backup-screen__label">{t('screen.backup.schedule')}</span>
            <span className="backup-screen__value backup-screen__value--mono">
              {schedule}
            </span>
          </div>
        </div>

        {/* Schedule card */}
        <div className="backup-screen__card surface-void opal-wireframe">
          <div className="backup-screen__card-header">
            <h2 className="backup-screen__card-title">{t('screen.backup.schedule')}</h2>
          </div>
          <div className="backup-screen__schedule-options">
            {scheduleOptions.map((opt) => (
              <button
                key={opt.value}
                className={`backup-screen__schedule-btn ${schedule === opt.value ? 'backup-screen__schedule-btn--active' : ''}`}
                onClick={() => setSchedule(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Destinations card */}
        <div className="backup-screen__card surface-void opal-wireframe">
          <div className="backup-screen__card-header">
            <h2 className="backup-screen__card-title">{t('screen.backup.destinations')}</h2>
            <button className="backup-screen__action-btn" disabled>
              {t('screen.backup.add_destination')}
            </button>
          </div>
          {destinations.length === 0 ? (
            <div className="backup-screen__empty">
              <p className="backup-screen__empty-text">
                {t('screen.backup.no_destinations')}
              </p>
            </div>
          ) : (
            <div className="backup-screen__list">
              {destinations.map((dest) => (
                <div key={dest.id} className="backup-screen__list-item">
                  <div className="backup-screen__list-item-info">
                    <span className="backup-screen__list-item-name">{dest.name}</span>
                    <span className="backup-screen__list-item-detail">{dest.path}</span>
                  </div>
                  <span className="backup-screen__list-item-meta">
                    {dest.lastBackupAt ?? t('screen.backup.never_backed_up')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions card */}
        <div className="backup-screen__card surface-void opal-wireframe">
          <div className="backup-screen__card-header">
            <h2 className="backup-screen__card-title">{t('screen.backup.actions')}</h2>
          </div>
          <div className="backup-screen__actions">
            <button
              className="backup-screen__action-btn backup-screen__action-btn--primary"
              disabled={destinations.length === 0 || isBackingUp}
            >
              {isBackingUp ? t('screen.backup.backing_up') : t('screen.backup.backup_now')}
            </button>
            <button
              className="backup-screen__action-btn"
              disabled={history.length === 0}
            >
              {t('screen.backup.restore')}
            </button>
          </div>
        </div>

        {/* History card */}
        <div className="backup-screen__card surface-void opal-wireframe">
          <div className="backup-screen__card-header">
            <h2 className="backup-screen__card-title">{t('screen.backup.history')}</h2>
          </div>
          {history.length === 0 ? (
            <div className="backup-screen__empty">
              <p className="backup-screen__empty-text">
                {t('screen.backup.no_history')}
              </p>
            </div>
          ) : (
            <div className="backup-screen__list">
              {history.map((entry) => (
                <div key={entry.id} className="backup-screen__list-item">
                  <div className="backup-screen__list-item-info">
                    <span className="backup-screen__list-item-name">
                      {entry.destinationName}
                    </span>
                    <span className="backup-screen__list-item-detail">
                      {entry.timestamp}
                    </span>
                  </div>
                  <span className={`backup-screen__list-item-status backup-screen__list-item-status--${entry.status}`}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

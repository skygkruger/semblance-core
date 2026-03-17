/**
 * BackupScreen — Local backup management with destinations, scheduling, and history.
 * All data persisted via IPC to the Rust backend (SQLite).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  backupGetConfig,
  backupGetHistory,
  backupUpdateConfig,
  backupCreate,
  backupRestore,
  backupAddDestination,
  backupRemoveDestination,
} from '../ipc/commands';
import type { BackupDestinationEntry, BackupHistoryRecord } from '../ipc/commands';
import './BackupScreen.css';

type BackupSchedule = 'manual' | 'daily' | 'weekly' | 'monthly';

export function BackupScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<BackupDestinationEntry[]>([]);
  const [history, setHistory] = useState<BackupHistoryRecord[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<BackupSchedule>('manual');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [config, hist] = await Promise.all([
          backupGetConfig(),
          backupGetHistory(),
        ]);
        setDestinations(config.destinations);
        setSchedule(config.schedule);
        setHistory(hist);

        if (hist.length > 0) {
          const latest = hist.reduce((a, b) =>
            new Date(a.timestamp) > new Date(b.timestamp) ? a : b,
          );
          setLastBackupAt(latest.timestamp);
        }
      } catch (err) {
        console.error('[BackupScreen] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSetSchedule = useCallback(async (newSchedule: BackupSchedule) => {
    const prev = schedule;
    setSchedule(newSchedule);
    try {
      await backupUpdateConfig({ schedule: newSchedule });
    } catch (err) {
      console.error('[BackupScreen] Failed to update schedule:', err);
      setSchedule(prev);
    }
  }, [schedule]);

  const handleAddDestination = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Select Backup Directory' });
      if (!selected) return;

      const dirPath = typeof selected === 'string' ? selected : String(selected);
      const dirName = dirPath.split(/[/\\]/).pop() || dirPath;

      const newDest = await backupAddDestination({
        name: dirName,
        path: dirPath,
        type: 'local',
      });
      setDestinations((prev) => [...prev, newDest]);
    } catch (err) {
      console.error('[BackupScreen] Failed to add destination:', err);
    }
  }, []);

  const handleRemoveDestination = useCallback(async (id: string) => {
    try {
      await backupRemoveDestination(id);
      setDestinations((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error('[BackupScreen] Failed to remove destination:', err);
    }
  }, []);

  const handleBackupNow = useCallback(async () => {
    if (destinations.length === 0 || isBackingUp) return;
    setIsBackingUp(true);
    setStatusMessage(null);
    try {
      const record = await backupCreate('');
      setHistory((prev) => [record, ...prev].slice(0, 100));
      setLastBackupAt(record.timestamp);

      // Refresh destinations to get updated lastBackupAt
      const config = await backupGetConfig();
      setDestinations(config.destinations);

      setStatusMessage(t('screen.backup.backup_success', 'Backup completed successfully'));
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('[BackupScreen] Backup failed:', err);
      setStatusMessage(t('screen.backup.backup_failed', 'Backup failed'));
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsBackingUp(false);
    }
  }, [destinations, isBackingUp, t]);

  const handleRestore = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        title: 'Select Backup Archive',
        multiple: false,
        filters: [{ name: 'Backup Archive', extensions: ['enc', 'bak', 'json'] }],
      });
      if (!filePath) return;

      const path = typeof filePath === 'string' ? filePath : String(filePath);
      await backupRestore({ filePath: path, passphrase: '' });

      setStatusMessage(t('screen.backup.restore_success', 'Restore completed successfully'));
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('[BackupScreen] Restore failed:', err);
      setStatusMessage(t('screen.backup.restore_failed', 'Restore failed'));
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [t]);

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

        {loading && (
          <p className="backup-screen__empty-text">{t('common.loading', 'Loading...')}</p>
        )}

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
                onClick={() => handleSetSchedule(opt.value)}
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
            <button className="backup-screen__action-btn" onClick={handleAddDestination}>
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
                  <div className="backup-screen__list-item-actions">
                    <span className="backup-screen__list-item-meta">
                      {dest.lastBackupAt ?? t('screen.backup.never_backed_up')}
                    </span>
                    <button
                      className="backup-screen__action-btn"
                      onClick={() => handleRemoveDestination(dest.id)}
                    >
                      {t('common.remove', 'Remove')}
                    </button>
                  </div>
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
              onClick={handleBackupNow}
            >
              {isBackingUp ? t('screen.backup.backing_up') : t('screen.backup.backup_now')}
            </button>
            <button
              className="backup-screen__action-btn"
              disabled={history.length === 0}
              onClick={handleRestore}
            >
              {t('screen.backup.restore')}
            </button>
          </div>
          {statusMessage && (
            <p className="backup-screen__status-message">{statusMessage}</p>
          )}
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

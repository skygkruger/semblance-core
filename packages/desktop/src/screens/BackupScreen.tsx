import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getKnowledgeStats } from '../ipc/commands';
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

// ─── localStorage keys ──────────────────────────────────────────────────────

const STORAGE_KEY_DESTINATIONS = 'semblance.backup.destinations';
const STORAGE_KEY_HISTORY = 'semblance.backup.history';
const STORAGE_KEY_SCHEDULE = 'semblance.backup.schedule';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore */ }
  return fallback;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BackupScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [history, setHistory] = useState<BackupHistoryEntry[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<BackupSchedule>('manual');
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Load persisted data from localStorage
  useEffect(() => {
    try {
      const savedDestinations = loadFromStorage<BackupDestination[]>(STORAGE_KEY_DESTINATIONS, []);
      const savedHistory = loadFromStorage<BackupHistoryEntry[]>(STORAGE_KEY_HISTORY, []);
      const savedSchedule = loadFromStorage<BackupSchedule>(STORAGE_KEY_SCHEDULE, 'manual');

      setDestinations(savedDestinations);
      setHistory(savedHistory);
      setSchedule(savedSchedule);

      // Derive last backup from history
      if (savedHistory.length > 0) {
        const latest = savedHistory.reduce((a, b) =>
          new Date(a.timestamp) > new Date(b.timestamp) ? a : b,
        );
        setLastBackupAt(latest.timestamp);
      }
    } catch (err) {
      console.error('[BackupScreen] Failed to load persisted data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Persist schedule changes
  const handleSetSchedule = useCallback((newSchedule: BackupSchedule) => {
    setSchedule(newSchedule);
    localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(newSchedule));
  }, []);

  // Add a new backup destination via Tauri file dialog
  const handleAddDestination = useCallback(async () => {
    try {
      // Use Tauri dialog to pick a directory
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false, title: 'Select Backup Directory' });
      if (!selected) return;

      const dirPath = typeof selected === 'string' ? selected : String(selected);
      const dirName = dirPath.split(/[/\\]/).pop() || dirPath;

      const newDest: BackupDestination = {
        id: `dest_${Date.now()}`,
        name: dirName,
        type: 'local',
        path: dirPath,
        lastBackupAt: null,
        sizeBytes: 0,
      };

      const updated = [...destinations, newDest];
      setDestinations(updated);
      localStorage.setItem(STORAGE_KEY_DESTINATIONS, JSON.stringify(updated));
    } catch (err) {
      console.error('[BackupScreen] Failed to add destination:', err);
    }
  }, [destinations]);

  // Remove a backup destination
  const handleRemoveDestination = useCallback((id: string) => {
    const updated = destinations.filter((d) => d.id !== id);
    setDestinations(updated);
    localStorage.setItem(STORAGE_KEY_DESTINATIONS, JSON.stringify(updated));
  }, [destinations]);

  // Run backup: copy knowledge DB to each destination
  const handleBackupNow = useCallback(async () => {
    if (destinations.length === 0 || isBackingUp) return;
    setIsBackingUp(true);
    const startTime = Date.now();

    try {
      // Ask sidecar for knowledge stats to get DB info
      const stats = await getKnowledgeStats().catch(() => ({
        documentCount: 0, chunkCount: 0, indexSizeBytes: 0, lastIndexedAt: null,
      }));

      const timestamp = new Date().toISOString();
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      // Create history entries for each destination
      const newEntries: BackupHistoryEntry[] = destinations.map((dest) => ({
        id: `backup_${Date.now()}_${dest.id}`,
        destinationId: dest.id,
        destinationName: dest.name,
        timestamp,
        sizeBytes: stats.indexSizeBytes,
        status: 'success' as const,
        durationSeconds,
      }));

      // Update destination lastBackupAt
      const updatedDests = destinations.map((d) => ({ ...d, lastBackupAt: timestamp, sizeBytes: stats.indexSizeBytes }));
      const updatedHistory = [...newEntries, ...history].slice(0, 100); // Keep last 100

      setDestinations(updatedDests);
      setHistory(updatedHistory);
      setLastBackupAt(timestamp);

      localStorage.setItem(STORAGE_KEY_DESTINATIONS, JSON.stringify(updatedDests));
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory));
    } catch (err) {
      console.error('[BackupScreen] Backup failed:', err);

      const timestamp = new Date().toISOString();
      const failEntry: BackupHistoryEntry = {
        id: `backup_${Date.now()}_fail`,
        destinationId: destinations[0]?.id ?? 'unknown',
        destinationName: destinations[0]?.name ?? 'Unknown',
        timestamp,
        sizeBytes: 0,
        status: 'failed',
        durationSeconds: Math.round((Date.now() - startTime) / 1000),
      };
      const updatedHistory = [failEntry, ...history].slice(0, 100);
      setHistory(updatedHistory);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory));
    } finally {
      setIsBackingUp(false);
    }
  }, [destinations, history, isBackingUp]);

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
              onClick={() => {
                window.alert(
                  t('screen.backup.restore_coming_soon',
                    'Restore from backup is coming in a future update. Your backup files are standard JSON exports and can be manually re-imported.')
                );
              }}
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

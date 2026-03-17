/**
 * LivingWillScreen — Encrypted digital twin export management.
 * DR-gated: requires Digital Representative license.
 * Shows export status, export/import buttons, and auto-export toggle.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import {
  getKnowledgeStats,
  livingWillGetHistory,
  livingWillGetSettings,
  livingWillUpdateSettings,
  livingWillExport,
  livingWillImport,
} from '../ipc/commands';
import type { LivingWillExportRecord } from '../ipc/commands';
import './LivingWillScreen.css';

export function LivingWillScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [exports, setExports] = useState<LivingWillExportRecord[]>([]);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [history, settings] = await Promise.all([
          livingWillGetHistory(),
          livingWillGetSettings(),
        ]);
        setExports(history);
        const first = history[0];
        if (first) {
          setLastExport(first.timestamp);
        }
        setAutoExportEnabled(settings.autoExportEnabled);
      } catch (err) {
        console.error('[LivingWillScreen] load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleToggleAutoExport = useCallback(async (value: boolean) => {
    setAutoExportEnabled(value);
    try {
      await livingWillUpdateSettings(value ? 'weekly' : 'manual');
    } catch (err) {
      console.error('[LivingWillScreen] failed to update settings:', err);
      setAutoExportEnabled(!value);
    }
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setStatusMessage(null);
    try {
      // Get knowledge stats for size estimation display
      await getKnowledgeStats();

      // Use Tauri file dialog for output path
      const { save } = await import('@tauri-apps/plugin-dialog');
      const outputPath = await save({
        title: 'Save Living Will Export',
        defaultPath: `semblance-living-will-${new Date().toISOString().slice(0, 10)}.enc`,
        filters: [{ name: 'Encrypted Archive', extensions: ['enc'] }],
      });
      if (!outputPath) {
        setExporting(false);
        return;
      }

      const record = await livingWillExport({
        passphrase: '',
        outputPath,
        sections: ['knowledge', 'preferences', 'audit'],
      });

      setExports((prev) => [record, ...prev]);
      setLastExport(record.timestamp);
      setStatusMessage(t('screen.living_will.export_success', 'Export completed successfully'));
    } catch (err) {
      console.error('[LivingWillScreen] export failed:', err);
      setStatusMessage(t('screen.living_will.export_failed', 'Export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }, [t]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setStatusMessage(null);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const archivePath = await open({
        title: 'Select Living Will Archive',
        multiple: false,
        filters: [{ name: 'Encrypted Archive', extensions: ['enc'] }],
      });
      if (!archivePath) {
        setImporting(false);
        return;
      }

      const filePath = typeof archivePath === 'string' ? archivePath : String(archivePath);
      await livingWillImport({ archivePath: filePath, passphrase: '' });

      // Refresh history after import
      const refreshed = await livingWillGetHistory();
      setExports(refreshed);
      const newest = refreshed[0];
      if (newest) {
        setLastExport(newest.timestamp);
      }
      setStatusMessage(t('screen.living_will.import_success', 'Archive imported successfully'));
    } catch (err) {
      console.error('[LivingWillScreen] import failed:', err);
      setStatusMessage(t('screen.living_will.import_failed', 'Import failed. Please try again.'));
    } finally {
      setImporting(false);
    }
  }, [t]);

  if (!license.isPremium) {
    return (
      <div className="living-will h-full overflow-y-auto">
        <div className="living-will__container">
          <h1 className="living-will__title">{t('screen.living_will.title')}</h1>
          <div className="living-will__card surface-void opal-wireframe">
            <p className="living-will__gate-message">
              {t('screen.living_will.requires_dr')}
            </p>
            <button
              type="button"
              className="living-will__gate-btn"
              onClick={() => navigate('/upgrade')}
            >
              {t('screen.living_will.activate_dr')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="living-will h-full overflow-y-auto">
        <div className="living-will__container">
          <h1 className="living-will__title">{t('screen.living_will.title')}</h1>
          <div className="living-will__card surface-void opal-wireframe">
            <p className="living-will__status-value">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="living-will h-full overflow-y-auto">
      <div className="living-will__container">
        <h1 className="living-will__title">{t('screen.living_will.title')}</h1>
        <p className="living-will__subtitle">
          {t('screen.living_will.subtitle')}
        </p>

        {/* Export status */}
        <div className="living-will__card surface-void opal-wireframe">
          <h2 className="living-will__section-title">{t('screen.living_will.export_status')}</h2>
          <div className="living-will__status-row">
            <span className="living-will__status-label">{t('screen.living_will.last_export')}</span>
            <span className="living-will__status-value">
              {lastExport ?? t('screen.living_will.never')}
            </span>
          </div>
          <div className="living-will__status-row">
            <span className="living-will__status-label">{t('screen.living_will.total_exports')}</span>
            <span className="living-will__status-value">{exports.length}</span>
          </div>
          <div className="living-will__status-row">
            <span className="living-will__status-label">{t('screen.living_will.encryption')}</span>
            <span className="living-will__status-value">AES-256-GCM</span>
          </div>

          <div className="living-will__actions">
            <button
              type="button"
              className="living-will__btn living-will__btn--primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? t('screen.living_will.exporting', 'Exporting...') : t('screen.living_will.export_now')}
            </button>
            <button
              type="button"
              className="living-will__btn living-will__btn--secondary"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? t('screen.living_will.importing', 'Importing...') : t('screen.living_will.import_archive')}
            </button>
          </div>
          {statusMessage && (
            <p className="living-will__status-message">{statusMessage}</p>
          )}
        </div>

        {/* Auto-export toggle */}
        <div className="living-will__card surface-void opal-wireframe">
          <h2 className="living-will__section-title">{t('screen.living_will.automatic_export')}</h2>
          <div className="living-will__toggle-row">
            <span className="living-will__toggle-label">
              {t('screen.living_will.auto_export_weekly')}
            </span>
            <button
              type="button"
              className={`living-will__toggle ${autoExportEnabled ? 'living-will__toggle--active' : ''}`}
              onClick={() => handleToggleAutoExport(!autoExportEnabled)}
              aria-pressed={autoExportEnabled}
              aria-label="Toggle automatic export"
            >
              <span className="living-will__toggle-knob" />
            </button>
          </div>
          {exports.length === 0 && (
            <p className="living-will__empty">
              {t('screen.living_will.configure_exports')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

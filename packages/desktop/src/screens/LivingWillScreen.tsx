/**
 * LivingWillScreen — Encrypted digital twin export management.
 * DR-gated: requires Digital Representative license.
 * Shows export status, export/import buttons, and auto-export toggle.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import { exportKnowledgeGraph, getKnowledgeStats } from '../ipc/commands';
import './LivingWillScreen.css';

interface ExportRecord {
  id: string;
  timestamp: string;
  path: string;
  sizeBytes: number;
  encrypted: boolean;
}

const STORAGE_KEY = 'semblance.living_will_exports';
const SETTINGS_KEY = 'semblance.living_will_settings';

function loadExports(): ExportRecord[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveExports(records: ExportRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function LivingWillScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        // Load export history from localStorage
        const records = loadExports();
        setExports(records);
        const first = records[0];
        if (first) {
          setLastExport(first.timestamp);
        }

        // Load settings
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          setAutoExportEnabled(parsed.autoExportEnabled ?? false);
        }
      } catch (err) {
        console.error('[LivingWillScreen] load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleToggleAutoExport = useCallback((value: boolean) => {
    setAutoExportEnabled(value);
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    const current = savedSettings ? JSON.parse(savedSettings) : {};
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, autoExportEnabled: value }));
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setStatusMessage(null);
    try {
      // Get knowledge stats for size estimation
      const stats = await getKnowledgeStats();

      // Trigger the knowledge graph export via IPC
      await exportKnowledgeGraph();

      // Record the export
      const record: ExportRecord = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        path: 'knowledge-export',
        sizeBytes: stats.indexSizeBytes,
        encrypted: true,
      };
      const updated = [record, ...exports];
      setExports(updated);
      setLastExport(record.timestamp);
      saveExports(updated);
      setStatusMessage(t('screen.living_will.export_success', 'Export completed successfully'));
    } catch (err) {
      console.error('[LivingWillScreen] export failed:', err);
      setStatusMessage(t('screen.living_will.export_failed', 'Export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }, [exports, t]);

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
              onClick={() => setStatusMessage(t('screen.living_will.import_coming_soon'))}
            >
              {t('screen.living_will.import_archive')}
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

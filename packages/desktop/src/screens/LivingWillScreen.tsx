/**
 * LivingWillScreen — Encrypted digital twin export management.
 * DR-gated: requires Digital Representative license.
 * Shows export status, export/import buttons, and auto-export toggle.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../contexts/LicenseContext';
import './LivingWillScreen.css';

interface ExportRecord {
  id: string;
  timestamp: string;
  sizeBytes: number;
  encrypted: boolean;
}

export function LivingWillScreen() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();
  const [autoExportEnabled, setAutoExportEnabled] = useState(false);
  const [exports] = useState<ExportRecord[]>([]);
  const [lastExport] = useState<string | null>(null);

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
            <button type="button" className="living-will__btn living-will__btn--primary">
              {t('screen.living_will.export_now')}
            </button>
            <button type="button" className="living-will__btn living-will__btn--secondary">
              {t('screen.living_will.import_archive')}
            </button>
          </div>
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
              onClick={() => setAutoExportEnabled(!autoExportEnabled)}
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

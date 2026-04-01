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
import { Input, SkeletonCard, FeatureGate } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { PageContainer } from '../components/PageContainer';
import { SectionDivider } from '../components/SectionDivider';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { ShimmerDescription } from '../components/ShimmerDescription';
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
  const [showPassphrasePrompt, setShowPassphrasePrompt] = useState<'export' | 'import' | null>(null);
  const [passphrase, setPassphrase] = useState('');

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

  const handleExportStart = useCallback(() => {
    setPassphrase('');
    setShowPassphrasePrompt('export');
  }, []);

  const handleExportConfirm = useCallback(async () => {
    if (!passphrase.trim()) {
      setStatusMessage(t('screen.living_will.passphrase_required', 'Passphrase is required for encryption.'));
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    setShowPassphrasePrompt(null);
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

      const result = await livingWillExport({
        passphrase: passphrase.trim(),
        outputPath,
        sections: ['knowledge', 'preferences', 'audit'],
      });

      if (!result.success) {
        throw new Error(result.error ?? 'Export failed');
      }

      // Map export result to display record
      const record: LivingWillExportRecord = {
        id: `export_${Date.now()}`,
        timestamp: new Date().toISOString(),
        path: result.archivePath ?? outputPath,
        sizeBytes: 0,
        encrypted: true,
      };
      setExports((prev) => [record, ...prev]);
      setLastExport(record.timestamp);
      setPassphrase('');
      setStatusMessage(t('screen.living_will.export_success', 'Export completed successfully'));
    } catch (err) {
      console.error('[LivingWillScreen] export failed:', err);
      setStatusMessage(t('screen.living_will.export_failed', 'Export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }, [passphrase, t]);

  const handleImportStart = useCallback(() => {
    setPassphrase('');
    setShowPassphrasePrompt('import');
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!passphrase.trim()) {
      setStatusMessage(t('screen.living_will.passphrase_required', 'Passphrase is required for decryption.'));
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    setShowPassphrasePrompt(null);
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
      await livingWillImport({ archivePath: filePath, passphrase: passphrase.trim() });

      // Refresh history after import
      const refreshed = await livingWillGetHistory();
      setExports(refreshed);
      const newest = refreshed[0];
      if (newest) {
        setLastExport(newest.timestamp);
      }
      setPassphrase('');
      setStatusMessage(t('screen.living_will.import_success', 'Archive imported successfully'));
    } catch (err) {
      console.error('[LivingWillScreen] import failed:', err);
      setStatusMessage(t('screen.living_will.import_failed', 'Import failed. Please try again.'));
    } finally {
      setImporting(false);
    }
  }, [passphrase, t]);

  if (!license.isPremium) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
      }}>
        <FeatureGate
          feature="living-will"
          isPremium={false}
          onLearnMore={() => navigate('/upgrade')}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <h1 className="page-title" style={{ fontSize: 28 }}>{t('screen.living_will.title')}</h1>
          <SkeletonCard variant="generic" message="Loading Living Will" subMessage="Retrieving export configuration" showSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <h1 className="page-title" style={{ fontSize: 28 }}>{t('screen.living_will.title')}</h1>
        <ShimmerDescription text="Encrypted digital twin exports for sovereignty and recovery" />
          <PageContainer>
            <FeatureStatusBanner title="EXPORT STATUS" statusLabel={exports.length > 0 ? `${exports.length} EXPORTS` : 'NO EXPORTS'} status={exports.length > 0 ? 'active' : 'error'} />
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

            {/* Passphrase prompt */}
            {showPassphrasePrompt && (
              <div className="living-will__passphrase-prompt">
                <p className="living-will__passphrase-label">
                  {showPassphrasePrompt === 'export'
                    ? t('screen.living_will.enter_passphrase_export', 'Enter a passphrase to encrypt the archive:')
                    : t('screen.living_will.enter_passphrase_import', 'Enter the passphrase used to encrypt this archive:')}
                </p>
                <Input
                  type="password"
                  placeholder={t('screen.living_will.passphrase_placeholder', 'Passphrase')}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (showPassphrasePrompt === 'export') handleExportConfirm();
                      else handleImportConfirm();
                    }
                  }}
                  autoFocus
                />
                <div className="living-will__passphrase-actions">
                  <button
                    type="button"
                    className="btn btn--opal btn--sm"
                    onClick={showPassphrasePrompt === 'export' ? handleExportConfirm : handleImportConfirm}
                    disabled={!passphrase.trim()}
                  >
                    <span className="btn__text">{t('common.confirm', 'Confirm')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => { setShowPassphrasePrompt(null); setPassphrase(''); }}
                  >
                    <span className="btn__text">{t('common.cancel', 'Cancel')}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="living-will__actions">
              <button
                type="button"
                className="btn btn--opal btn--sm"
                onClick={handleExportStart}
                disabled={exporting || showPassphrasePrompt !== null}
              >
                <span className="btn__text">{exporting ? t('screen.living_will.exporting', 'Exporting...') : t('screen.living_will.export_now')}</span>
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleImportStart}
                disabled={importing || showPassphrasePrompt !== null}
              >
                <span className="btn__text">{importing ? t('screen.living_will.importing', 'Importing...') : t('screen.living_will.import_archive')}</span>
              </button>
            </div>
            {statusMessage && (
              <p className="living-will__status-message">{statusMessage}</p>
            )}

            <SectionDivider />

            <FeatureStatusBanner title="AUTOMATIC EXPORT" statusLabel={autoExportEnabled ? 'WEEKLY' : 'MANUAL'} status={autoExportEnabled ? 'active' : 'inactive'} />
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
          </PageContainer>
        </ContentBracket>
      </div>
    </div>
  );
}

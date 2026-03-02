import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './Settings.css';
import { BackArrow, ShieldCheck, ShieldAlert } from './SettingsIcons';
import type { SettingsPrivacyProps } from './SettingsPrivacy.types';

export function SettingsPrivacy({
  lastAuditTime,
  auditStatus,
  dataSources,
  onRunAudit,
  onExportData,
  onExportHistory,
  onDeleteSourceData,
  onDeleteAllData,
  onResetSemblance,
  onBack,
}: SettingsPrivacyProps) {
  const { t } = useTranslation('settings');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const auditClean = auditStatus === 'clean';
  const neverRun = auditStatus === 'never-run';
  const cardBorderClass = auditClean ? 'settings-card--active' : neverRun ? '' : 'settings-card--amber';

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('privacy.title')}</h1>
      </div>

      <div className="settings-content">
        {/* Privacy Status Card */}
        <div style={{ padding: '16px 0 0' }}>
          <div className={`settings-card ${cardBorderClass}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ color: auditClean ? '#6ECFA3' : '#C9A85C' }}>{auditClean ? <ShieldCheck /> : <ShieldAlert />}</span>
              <span
                className={auditClean ? 'settings-badge settings-badge--veridian' : neverRun ? 'settings-badge settings-badge--muted' : 'settings-badge settings-badge--amber'}
              >
                {auditClean ? t('privacy.audit_badge_pass') : neverRun ? t('privacy.audit_badge_never_run') : t('privacy.audit_badge_review_needed')}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 12 }}>
              {lastAuditTime ? t('privacy.audit_last_run', { time: lastAuditTime }) : t('privacy.audit_never_run')}
            </div>
            <button type="button" className="settings-ghost-button" onClick={onRunAudit}>
              {t('privacy.btn_run_audit')}
            </button>
          </div>
        </div>

        {/* Data Sources */}
        {dataSources.length > 0 && (
          <>
            <div className="settings-section-header">{t('privacy.section_data_sources')}</div>
            {dataSources.map((source) => (
              <div key={source.id} className="settings-row">
                <span className="settings-row__label">{source.name}</span>
                <span className="settings-row__value">
                  {t('privacy.data_source_items', { n: source.entityCount, date: source.lastIndexed })}
                </span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#C97B6E',
                    fontSize: 12,
                    fontFamily: "'DM Mono', monospace",
                    cursor: 'pointer',
                    padding: '4px 8px',
                  }}
                  onClick={() => onDeleteSourceData(source.id)}
                >
                  {t('privacy.btn_remove_source')}
                </button>
              </div>
            ))}
          </>
        )}

        {/* Export & Portability */}
        <div className="settings-section-header">{t('privacy.section_export')}</div>
        <button type="button" className="settings-row" onClick={onExportData}>
          <span className="settings-row__label">{t('privacy.btn_export_data')}</span>
        </button>
        <button type="button" className="settings-row" onClick={onExportHistory}>
          <span className="settings-row__label">{t('privacy.btn_export_history')}</span>
        </button>

        {/* Danger Zone */}
        <div className="settings-section-header settings-section-header--danger">{t('privacy.section_danger')}</div>

        <button
          type="button"
          className="settings-row settings-row--danger"
          onClick={() => setShowDeleteAll(true)}
        >
          <span className="settings-row__label">{t('privacy.btn_delete_all')}</span>
        </button>

        {showDeleteAll && (
          <div style={{ padding: '12px 20px' }}>
            <p style={{ fontSize: 13, color: '#C97B6E', marginBottom: 8 }}>
              {t('privacy.delete_confirm_prompt')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="settings-inline-edit__input"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={t('privacy.delete_confirm_placeholder')}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--save"
                style={{ color: deleteConfirm === 'delete' ? '#C97B6E' : '#5E6B7C' }}
                onClick={() => {
                  if (deleteConfirm === 'delete') {
                    onDeleteAllData();
                    setShowDeleteAll(false);
                    setDeleteConfirm('');
                  }
                }}
              >
                {t('privacy.btn_confirm')}
              </button>
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--cancel"
                onClick={() => { setShowDeleteAll(false); setDeleteConfirm(''); }}
              >
                {t('privacy.btn_cancel')}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="settings-row settings-row--danger"
          onClick={() => setShowReset(true)}
        >
          <span className="settings-row__label">{t('privacy.btn_reset_semblance')}</span>
        </button>

        {showReset && (
          <div style={{ padding: '12px 20px' }}>
            <p style={{ fontSize: 13, color: '#C97B6E', marginBottom: 8 }}>
              {t('privacy.reset_confirm_body')}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                style={{
                  background: '#C97B6E',
                  border: 'none',
                  color: '#0B0E11',
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
                onClick={() => { onResetSemblance(); setShowReset(false); }}
              >
                {t('privacy.btn_reset_everything')}
              </button>
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--cancel"
                onClick={() => setShowReset(false)}
              >
                {t('privacy.btn_cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

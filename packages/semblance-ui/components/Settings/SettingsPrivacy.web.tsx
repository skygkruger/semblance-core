import { useState } from 'react';
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
        <h1 className="settings-header__title">Privacy</h1>
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
                {auditClean ? 'PASS' : neverRun ? 'NEVER RUN' : 'REVIEW NEEDED'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 12 }}>
              {lastAuditTime ? `Last audit: ${lastAuditTime}` : 'No audit has been run yet'}
            </div>
            <button type="button" className="settings-ghost-button" onClick={onRunAudit}>
              Run audit
            </button>
          </div>
        </div>

        {/* Data Sources */}
        {dataSources.length > 0 && (
          <>
            <div className="settings-section-header">Data Sources</div>
            {dataSources.map((source) => (
              <div key={source.id} className="settings-row">
                <span className="settings-row__label">{source.name}</span>
                <span className="settings-row__value">
                  {source.entityCount} items · {source.lastIndexed}
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
                  Remove
                </button>
              </div>
            ))}
          </>
        )}

        {/* Export & Portability */}
        <div className="settings-section-header">Export & Portability</div>
        <button type="button" className="settings-row" onClick={onExportData}>
          <span className="settings-row__label">Export all my data</span>
        </button>
        <button type="button" className="settings-row" onClick={onExportHistory}>
          <span className="settings-row__label">Export action history</span>
        </button>

        {/* Danger Zone */}
        <div className="settings-section-header settings-section-header--danger">Danger Zone</div>

        <button
          type="button"
          className="settings-row settings-row--danger"
          onClick={() => setShowDeleteAll(true)}
        >
          <span className="settings-row__label">Delete all indexed data</span>
        </button>

        {showDeleteAll && (
          <div style={{ padding: '12px 20px' }}>
            <p style={{ fontSize: 13, color: '#C97B6E', marginBottom: 8 }}>
              Type &quot;delete&quot; to confirm:
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="settings-inline-edit__input"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="delete"
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
                Confirm
              </button>
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--cancel"
                onClick={() => { setShowDeleteAll(false); setDeleteConfirm(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="settings-row settings-row--danger"
          onClick={() => setShowReset(true)}
        >
          <span className="settings-row__label">Reset Semblance</span>
        </button>

        {showReset && (
          <div style={{ padding: '12px 20px' }}>
            <p style={{ fontSize: 13, color: '#C97B6E', marginBottom: 8 }}>
              This will permanently delete all data and reset Semblance to factory state.
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
                Reset everything
              </button>
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--cancel"
                onClick={() => setShowReset(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

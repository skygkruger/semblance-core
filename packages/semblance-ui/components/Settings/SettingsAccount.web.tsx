import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './Settings.css';
import { BackArrow } from './SettingsIcons';
import type { SettingsAccountProps } from './SettingsAccount.types';

const licenseConfigs: Record<string, { label: string; badge: string; badgeClass: string; cardClass: string; desc: string }> = {
  'founding-member': {
    label: 'Founding Member',
    badge: 'FOUNDING MEMBER',
    badgeClass: 'settings-badge settings-badge--opal',
    cardClass: 'settings-card settings-card--opal',
    desc: 'Lifetime access · all features',
  },
  active: {
    label: 'Digital Representative',
    badge: 'ACTIVE',
    badgeClass: 'settings-badge settings-badge--veridian',
    cardClass: 'settings-card settings-card--active',
    desc: 'All premium features active',
  },
  trial: {
    label: 'Trial',
    badge: 'TRIAL',
    badgeClass: 'settings-badge settings-badge--muted',
    cardClass: 'settings-card',
    desc: 'Exploring premium features',
  },
  expired: {
    label: 'Expired',
    badge: 'EXPIRED',
    badgeClass: 'settings-badge settings-badge--rust',
    cardClass: 'settings-card settings-card--rust',
    desc: 'License expired — core features still available',
  },
};

export function SettingsAccount({
  licenseStatus,
  licenseActivationDate,
  trialDaysRemaining,
  digitalRepresentativeActive,
  digitalRepresentativeActivationDate,
  semblanceName,
  onRenewLicense,
  onActivateDigitalRepresentative,
  onViewDRAgreement,
  onRenameSemblance,
  onSignOut,
  onDeactivateLicense,
  onBack,
}: SettingsAccountProps) {
  const { t } = useTranslation('settings');
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState(semblanceName);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const config = licenseConfigs[licenseStatus] ?? licenseConfigs['active']!;

  const handleSaveName = () => {
    if (nameValue.trim()) {
      onRenameSemblance(nameValue.trim());
      setEditing(false);
    }
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('account.title')}</h1>
      </div>

      <div className="settings-content">
        {/* License Status Card */}
        <div style={{ padding: '16px 0 0' }}>
          <div className={config.cardClass}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 400, color: '#EEF1F4' }}>{t(`account.license_configs.${licenseStatus === 'founding-member' ? 'founding_member' : licenseStatus}.label`)}</span>
              <span className={config.badgeClass}>{t(`account.license_configs.${licenseStatus === 'founding-member' ? 'founding_member' : licenseStatus}.badge`)}</span>
            </div>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 4 }}>{t(`account.license_configs.${licenseStatus === 'founding-member' ? 'founding_member' : licenseStatus}.desc`)}</div>
            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#5E6B7C' }}>
              {licenseStatus === 'trial' && trialDaysRemaining !== undefined
                ? t('account.trial_days_remaining', { n: trialDaysRemaining })
                : t('account.activated_date', { date: licenseActivationDate })}
            </div>
            {licenseStatus === 'expired' && (
              <button
                type="button"
                className="settings-ghost-button"
                style={{ marginTop: 12 }}
                onClick={onRenewLicense}
              >
                {t('account.btn_renew_license')}
              </button>
            )}
          </div>
        </div>

        {/* Digital Representative */}
        <div className="settings-section-header">{t('account.section_digital_representative')}</div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{t('account.dr_status_label')}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="settings-row__dot"
              style={{
                background: digitalRepresentativeActive ? '#6ECFA3' : '#8593A4',
                margin: 0,
              }}
            />
            <span className="settings-row__value" style={{ marginRight: 0 }}>
              {digitalRepresentativeActive ? t('account.dr_status_active') : t('account.dr_status_inactive')}
            </span>
          </span>
        </div>

        {digitalRepresentativeActive && digitalRepresentativeActivationDate && (
          <div className="settings-row settings-row--static">
            <span className="settings-row__label">{t('account.dr_activation_date_label')}</span>
            <span className="settings-row__value">{digitalRepresentativeActivationDate}</span>
          </div>
        )}

        <button type="button" className="settings-row" onClick={onViewDRAgreement}>
          <span className="settings-row__label">{t('account.btn_view_dr_agreement')}</span>
        </button>

        {!digitalRepresentativeActive && (
          <button type="button" className="settings-row" onClick={onActivateDigitalRepresentative}>
            <span className="settings-row__label" style={{ color: '#6ECFA3' }}>
              {t('account.btn_activate_dr')}
            </span>
          </button>
        )}

        {/* Semblance Identity */}
        <div className="settings-section-header">{t('account.section_semblance_identity')}</div>

        {editing ? (
          <div className="settings-inline-edit">
            <input
              type="text"
              className="settings-inline-edit__input"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              autoFocus
            />
            <button type="button" className="settings-inline-edit__btn settings-inline-edit__btn--save" onClick={handleSaveName}>
              {t('account.btn_save')}
            </button>
            <button type="button" className="settings-inline-edit__btn settings-inline-edit__btn--cancel" onClick={() => { setEditing(false); setNameValue(semblanceName); }}>
              {t('account.btn_cancel')}
            </button>
          </div>
        ) : (
          <button type="button" className="settings-row" onClick={() => setEditing(true)}>
            <span className="settings-row__label">{t('account.label_semblance_name')}</span>
            <span className="settings-row__value settings-name-gradient">{semblanceName}</span>
          </button>
        )}

        {/* Danger Zone */}
        <div className="settings-section-header settings-section-header--danger">{t('account.section_danger')}</div>

        <button type="button" className="settings-row" onClick={onSignOut}>
          <span className="settings-row__label" style={{ color: '#8593A4' }}>{t('account.btn_sign_out')}</span>
        </button>

        <button
          type="button"
          className="settings-row settings-row--danger"
          onClick={() => setConfirmDeactivate(true)}
        >
          <span className="settings-row__label">{t('account.btn_deactivate_license')}</span>
        </button>

        {confirmDeactivate && (
          <div style={{ padding: '12px 20px' }}>
            <p style={{ fontSize: 13, color: '#C97B6E', marginBottom: 8 }}>
              {t('account.deactivate_confirm_body')}
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
                onClick={() => { onDeactivateLicense(); setConfirmDeactivate(false); }}
              >
                {t('account.btn_deactivate')}
              </button>
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--cancel"
                onClick={() => setConfirmDeactivate(false)}
              >
                {t('account.btn_cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

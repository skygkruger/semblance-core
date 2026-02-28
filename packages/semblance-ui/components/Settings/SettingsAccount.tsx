import { useState } from 'react';
import './Settings.css';
import { BackArrow } from './SettingsIcons';

interface SettingsAccountProps {
  licenseStatus: 'founding-member' | 'active' | 'trial' | 'expired';
  licenseActivationDate: string;
  trialDaysRemaining?: number;
  digitalRepresentativeActive: boolean;
  digitalRepresentativeActivationDate: string | null;
  semblanceName: string;
  onRenewLicense: () => void;
  onActivateDigitalRepresentative: () => void;
  onViewDRAgreement: () => void;
  onRenameSemblance: (name: string) => void;
  onSignOut: () => void;
  onDeactivateLicense: () => void;
  onBack: () => void;
}

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
        <h1 className="settings-header__title">Account</h1>
      </div>

      <div className="settings-content">
        {/* License Status Card */}
        <div style={{ padding: '16px 0 0' }}>
          <div className={config.cardClass}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 400, color: '#EEF1F4' }}>{config.label}</span>
              <span className={config.badgeClass}>{config.badge}</span>
            </div>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 4 }}>{config.desc}</div>
            <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: '#5E6B7C' }}>
              {licenseStatus === 'trial' && trialDaysRemaining !== undefined
                ? `${trialDaysRemaining} days remaining`
                : `Activated ${licenseActivationDate}`}
            </div>
            {licenseStatus === 'expired' && (
              <button
                type="button"
                className="settings-ghost-button"
                style={{ marginTop: 12 }}
                onClick={onRenewLicense}
              >
                Renew license
              </button>
            )}
          </div>
        </div>

        {/* Digital Representative */}
        <div className="settings-section-header">Digital Representative</div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Status</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="settings-row__dot"
              style={{
                background: digitalRepresentativeActive ? '#6ECFA3' : '#8593A4',
                margin: 0,
              }}
            />
            <span className="settings-row__value" style={{ marginRight: 0 }}>
              {digitalRepresentativeActive ? 'Active' : 'Not activated'}
            </span>
          </span>
        </div>

        {digitalRepresentativeActive && digitalRepresentativeActivationDate && (
          <div className="settings-row settings-row--static">
            <span className="settings-row__label">Activation date</span>
            <span className="settings-row__value">{digitalRepresentativeActivationDate}</span>
          </div>
        )}

        <button type="button" className="settings-row" onClick={onViewDRAgreement}>
          <span className="settings-row__label">View Digital Representative agreement</span>
        </button>

        {!digitalRepresentativeActive && (
          <button type="button" className="settings-row" onClick={onActivateDigitalRepresentative}>
            <span className="settings-row__label" style={{ color: '#6ECFA3' }}>
              Activate Digital Representative
            </span>
          </button>
        )}

        {/* Semblance Identity */}
        <div className="settings-section-header">Semblance Identity</div>

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
              Save
            </button>
            <button type="button" className="settings-inline-edit__btn settings-inline-edit__btn--cancel" onClick={() => { setEditing(false); setNameValue(semblanceName); }}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="settings-row" onClick={() => setEditing(true)}>
            <span className="settings-row__label">Your Semblance&apos;s name</span>
            <span className="settings-row__value settings-name-gradient">{semblanceName}</span>
          </button>
        )}

        {/* Danger Zone */}
        <div className="settings-section-header settings-section-header--danger">Danger Zone</div>

        <button type="button" className="settings-row" onClick={onSignOut}>
          <span className="settings-row__label" style={{ color: '#8593A4' }}>Sign out</span>
        </button>

        <button
          type="button"
          className="settings-row settings-row--danger"
          onClick={() => setConfirmDeactivate(true)}
        >
          <span className="settings-row__label">Deactivate license</span>
        </button>

        {confirmDeactivate && (
          <div style={{ padding: '12px 20px' }}>
            <p style={{ fontSize: 13, color: '#C97B6E', marginBottom: 8 }}>
              Are you sure? This will deactivate your license on this device.
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
                Deactivate
              </button>
              <button
                type="button"
                className="settings-inline-edit__btn settings-inline-edit__btn--cancel"
                onClick={() => setConfirmDeactivate(false)}
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

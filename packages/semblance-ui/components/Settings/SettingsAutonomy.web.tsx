import type { ReactNode } from 'react';
import './Settings.css';
import { BackArrow, GuardianIcon, PartnerIcon, AlterEgoIcon } from './SettingsIcons';
import type { Tier, SettingsAutonomyProps } from './SettingsAutonomy.types';
import { tiers, tierLabels, domains, reviewLabels } from './SettingsAutonomy.types';

const tierIcons: Record<Tier, ReactNode> = {
  guardian: <GuardianIcon />,
  partner: <PartnerIcon />,
  'alter-ego': <AlterEgoIcon />,
};

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="settings-toggle"
      data-on={String(on)}
      onClick={disabled ? undefined : onToggle}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <span className="settings-toggle__thumb" />
    </button>
  );
}

export function SettingsAutonomy({
  currentTier,
  domainOverrides,
  requireConfirmationForIrreversible,
  actionReviewWindow,
  onChange,
  onBack,
}: SettingsAutonomyProps) {
  const isGuardian = currentTier === 'guardian';

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Autonomy</h1>
      </div>

      <div className="settings-content">
        {/* Tier Selector */}
        <div style={{ paddingTop: 16 }}>
          {tiers.map((tier) => {
            const isActive = currentTier === tier.id;
            return (
              <button
                key={tier.id}
                type="button"
                className={`settings-tier-card ${isActive ? 'settings-tier-card--active' : ''}`}
                onClick={() => onChange('currentTier', tier.id)}
              >
                <span className="settings-tier-card__icon">{tierIcons[tier.id]}</span>
                <div className="settings-tier-card__body">
                  <div className="settings-tier-card__header">
                    <span className="settings-tier-card__name">{tier.name}</span>
                    <span
                      className="settings-badge settings-badge--veridian"
                      style={isActive ? undefined : { visibility: 'hidden' }}
                    >
                      ACTIVE
                    </span>
                  </div>
                  <span className="settings-tier-card__desc">{tier.desc}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Domain Overrides */}
        <div className="settings-section-header">Domain Overrides</div>
        <p className="settings-explanation" style={{ marginBottom: 12 }}>
          Override the default tier for specific areas. Useful if you want Alter Ego everywhere except Finance.
        </p>

        {domains.map((domain) => {
          const key = domain.toLowerCase();
          const override = domainOverrides[key] || 'default';
          return (
            <div key={domain} className="settings-row settings-row--static">
              <span className="settings-row__label">{domain}</span>
              <span className="settings-row__value">{tierLabels[override]}</span>
            </div>
          );
        })}

        {/* Safety */}
        <div className="settings-section-header">Safety</div>

        <div
          className="settings-row"
          onClick={isGuardian ? undefined : () => onChange('requireConfirmationForIrreversible', !requireConfirmationForIrreversible)}
        >
          <span className="settings-row__label">Require confirmation for irreversible actions</span>
          <Toggle
            on={requireConfirmationForIrreversible}
            onToggle={() => onChange('requireConfirmationForIrreversible', !requireConfirmationForIrreversible)}
            disabled={isGuardian}
          />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Action review window</span>
          <span className="settings-row__value">{reviewLabels[actionReviewWindow]}</span>
        </div>

        <p className="settings-explanation settings-explanation--small" style={{ paddingTop: 8 }}>
          Irreversible actions include sent emails, deleted files, cancelled subscriptions, and calendar changes affecting others.
        </p>
      </div>
    </div>
  );
}

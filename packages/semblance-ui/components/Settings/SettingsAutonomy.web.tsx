import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const isGuardian = currentTier === 'guardian';

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('autonomy.title')}</h1>
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
                    <span className="settings-tier-card__name">{t(`autonomy.tiers.${tier.id}.name`)}</span>
                    <span
                      className="settings-badge settings-badge--veridian"
                      style={isActive ? undefined : { visibility: 'hidden' }}
                    >
                      {t('autonomy.badge_active')}
                    </span>
                  </div>
                  <span className="settings-tier-card__desc">{t(`autonomy.tiers.${tier.id}.desc`)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Domain Overrides */}
        <div className="settings-section-header">{t('autonomy.section_domain_overrides')}</div>
        <p className="settings-explanation" style={{ marginBottom: 12 }}>
          {t('autonomy.domain_overrides_explanation')}
        </p>

        {domains.map((domain) => {
          const key = domain.toLowerCase();
          const override = domainOverrides[key] || 'default';
          return (
            <div key={domain} className="settings-row settings-row--static">
              <span className="settings-row__label">{t(`autonomy.domains.${key}`)}</span>
              <span className="settings-row__value">{tierLabels[override]}</span>
            </div>
          );
        })}

        {/* Safety */}
        <div className="settings-section-header">{t('autonomy.section_safety')}</div>

        <div
          className="settings-row"
          onClick={isGuardian ? undefined : () => onChange('requireConfirmationForIrreversible', !requireConfirmationForIrreversible)}
        >
          <span className="settings-row__label">{t('autonomy.label_require_confirmation')}</span>
          <Toggle
            on={requireConfirmationForIrreversible}
            onToggle={() => onChange('requireConfirmationForIrreversible', !requireConfirmationForIrreversible)}
            disabled={isGuardian}
          />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{t('autonomy.label_action_review_window')}</span>
          <span className="settings-row__value">{reviewLabels[actionReviewWindow]}</span>
        </div>

        <p className="settings-explanation settings-explanation--small" style={{ paddingTop: 8 }}>
          {t('autonomy.irreversible_actions_explanation')}
        </p>
      </div>
    </div>
  );
}

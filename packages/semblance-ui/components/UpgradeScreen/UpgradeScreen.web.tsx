import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import { LicenseActivation } from '../LicenseActivation/LicenseActivation';
import type { UpgradeScreenProps } from './UpgradeScreen.types';
import { FEATURES } from './UpgradeScreen.types';
import './UpgradeScreen.css';

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function UpgradeScreen({
  currentTier,
  isFoundingMember,
  foundingSeat,
  onCheckout,
  onActivateKey,
  onManageSubscription,
  onBack,
}: UpgradeScreenProps) {
  const { t } = useTranslation();
  const isActive = currentTier !== 'free';

  return (
    <div className="upgrade-screen">
      {onBack && (
        <button type="button" className="upgrade-screen__back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          {t('button.back')}
        </button>
      )}

      <div className="upgrade-screen__header">
        <h1 className="upgrade-screen__title">
          {isActive ? t('screen.upgrade.title_active') : t('screen.upgrade.title_upgrade')}
        </h1>
        <p className="upgrade-screen__subtitle">
          {isActive
            ? t('screen.upgrade.subtitle_active', { plan: currentTier === 'digital-representative' ? 'Digital Representative' : currentTier === 'founding' ? 'Founding Member' : 'Lifetime' })
            : t('screen.upgrade.subtitle_upgrade')
          }
        </p>
      </div>

      {!isActive && (
        <div className="upgrade-screen__plans">
          {/* Monthly */}
          <div className="upgrade-screen__plan">
            <div className="upgrade-screen__plan-header">
              <span className="upgrade-screen__plan-label">{t('screen.upgrade.plan_monthly')}</span>
              <div className="upgrade-screen__plan-price">
                <span className="upgrade-screen__price-amount">{t('screen.upgrade.price_monthly')}</span>
                <span className="upgrade-screen__price-period">{t('screen.upgrade.period_monthly')}</span>
              </div>
            </div>
            <ul className="upgrade-screen__feature-list">
              {FEATURES.map((f) => (
                <li key={f} className="upgrade-screen__feature-item">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="md" onClick={() => onCheckout('monthly')} className="upgrade-screen__cta">
              {t('screen.upgrade.cta_monthly')}
            </Button>
          </div>

          {/* Founding */}
          <div className="upgrade-screen__plan upgrade-screen__plan--recommended">
            <div className="upgrade-screen__plan-badge">{t('screen.upgrade.recommended')}</div>
            <div className="upgrade-screen__plan-header">
              <span className="upgrade-screen__plan-label">{t('screen.upgrade.plan_founding')}</span>
              <div className="upgrade-screen__plan-price">
                <span className="upgrade-screen__price-amount">{t('screen.upgrade.price_founding')}</span>
                <span className="upgrade-screen__price-period">{t('screen.upgrade.period_founding')}</span>
              </div>
            </div>
            <p className="upgrade-screen__plan-note">
              {t('screen.upgrade.founding_note')}
            </p>
            <ul className="upgrade-screen__feature-list">
              {FEATURES.map((f) => (
                <li key={f} className="upgrade-screen__feature-item">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
              <li className="upgrade-screen__feature-item upgrade-screen__feature-item--bonus">
                <CheckIcon />
                <span>{t('upgrade.founding_bonus')}</span>
              </li>
            </ul>
            <Button variant="solid" size="md" onClick={() => onCheckout('founding')} className="upgrade-screen__cta">
              {t('screen.upgrade.cta_founding')}
            </Button>
          </div>

          {/* Lifetime */}
          <div className="upgrade-screen__plan">
            <div className="upgrade-screen__plan-header">
              <span className="upgrade-screen__plan-label">{t('screen.upgrade.plan_lifetime')}</span>
              <div className="upgrade-screen__plan-price">
                <span className="upgrade-screen__price-amount">{t('screen.upgrade.price_lifetime')}</span>
                <span className="upgrade-screen__price-period">{t('screen.upgrade.period_lifetime')}</span>
              </div>
            </div>
            <ul className="upgrade-screen__feature-list">
              {FEATURES.map((f) => (
                <li key={f} className="upgrade-screen__feature-item">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="md" onClick={() => onCheckout('lifetime')} className="upgrade-screen__cta">
              {t('screen.upgrade.cta_lifetime')}
            </Button>
          </div>
        </div>
      )}

      {isActive && isFoundingMember && foundingSeat !== null && (
        <div className="upgrade-screen__active-info">
          <p className="upgrade-screen__active-tier">{t('screen.upgrade.active_founding', { seat: foundingSeat })}</p>
          <p className="upgrade-screen__active-note">{t('screen.upgrade.active_note_lifetime')}</p>
        </div>
      )}

      {isActive && currentTier === 'digital-representative' && onManageSubscription && (
        <div className="upgrade-screen__active-info">
          <p className="upgrade-screen__active-tier">{t('license.digital_representative')}</p>
          <p className="upgrade-screen__active-note">{t('screen.upgrade.active_note_dr')}</p>
          <Button variant="ghost" size="sm" onClick={onManageSubscription} className="upgrade-screen__manage-btn">
            {t('screen.settings.btn_manage_subscription')}
          </Button>
        </div>
      )}

      {isActive && currentTier === 'lifetime' && !isFoundingMember && (
        <div className="upgrade-screen__active-info">
          <p className="upgrade-screen__active-tier">{t('license.lifetime')}</p>
          <p className="upgrade-screen__active-note">{t('screen.upgrade.active_note_lifetime')}</p>
        </div>
      )}

      <div className="upgrade-screen__activation">
        <div className="upgrade-screen__activation-divider" />
        <p className="upgrade-screen__activation-label">{t('screen.upgrade.activation_label')}</p>
        <LicenseActivation onActivate={onActivateKey} />
      </div>
    </div>
  );
}

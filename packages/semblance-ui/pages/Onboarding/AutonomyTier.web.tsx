import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import type { AutonomyTierProps } from './AutonomyTier.types';
import type { AutonomyTier as AutonomyTierType } from '../../components/AutonomySelector/AutonomySelector.types';
import './Onboarding.css';

const tierIds: Array<{ id: AutonomyTierType; recommended: boolean }> = [
  { id: 'guardian', recommended: false },
  { id: 'partner', recommended: true },
];

export function AutonomyTier({ value, onChange, onContinue, onBack }: AutonomyTierProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 560,
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-2xl)' }}>
        {t('autonomy.headline')}
      </h2>
      <div className="onboarding-content-frame">
        {tierIds.map((tier, i) => (
          <div
            key={tier.id}
            onClick={() => onChange(tier.id)}
            className={`onboarding-content-frame__item ${tier.id === value ? 'onboarding-content-frame__item--selected' : ''}`}
            style={{
              animation: 'dissolve 700ms var(--eo) both',
              animationDelay: `${i * 80}ms`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-lg)', fontWeight: 400, color: '#EEF1F4' }}>
                {t(`autonomy.tiers.${tier.id}.name`)}
              </span>
              {tier.recommended && (
                <span style={{
                  fontFamily: 'var(--fm)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#6ECFA3',
                  background: 'rgba(110, 207, 163, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 'var(--r-sm)',
                }}>
                  {t('autonomy.recommended_badge')}
                </span>
              )}
            </div>
            <p style={{ fontFamily: 'var(--fb)', fontSize: 'var(--text-sm)', color: '#8593A4', marginTop: 6, lineHeight: 1.5 }}>
              {t(`autonomy.tiers.${tier.id}.description`)}
            </p>
          </div>
        ))}

        {/* Alter Ego note */}
        <p style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: 12,
          color: '#5E6B7C',
          margin: 0,
          padding: '8px 12px',
          lineHeight: 1.5,
        }}>
          {t('autonomy.alter_ego_note')}
        </p>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px',
              color: '#5E6B7C', transition: 'color 150ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#8593A4')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5E6B7C')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15l-5-5 5-5" />
            </svg>
          </button>
        )}
        <Button variant="opal" onClick={onContinue}><span className="btn__text">{t('autonomy.continue_button')}</span></Button>
      </div>
    </div>
  );
}

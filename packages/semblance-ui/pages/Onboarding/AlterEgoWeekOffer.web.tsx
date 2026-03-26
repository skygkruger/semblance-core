import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import type { AlterEgoWeekOfferProps } from './AlterEgoWeekOffer.types';
import './Onboarding.css';

export function AlterEgoWeekOffer({ onAccept, onSkip, onBack }: AlterEgoWeekOfferProps) {
  const { t } = useTranslation('onboarding');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 520,
      width: '100%',
      animation: 'dissolve 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      <h2 className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-2xl)' }}>
        {t('alter_ego_week_offer.headline')}
      </h2>

      <div className="onboarding-content-frame" style={{ width: '100%' }}>
        <div style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: '#A8B4C0',
            margin: 0,
            lineHeight: 1.6,
          }}>
            {t('alter_ego_week_offer.description')}
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <div key={day} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 0',
              }}>
                <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11,
                  color: '#6ECFA3',
                  background: 'rgba(110, 207, 163, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  minWidth: 44,
                  textAlign: 'center',
                }}>
                  {t('alter_ego_week_offer.day_label', { day })}
                </span>
                <span style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: 13,
                  color: '#CDD4DB',
                }}>
                  {t(`alter_ego_week_offer.days.${day}`)}
                </span>
              </div>
            ))}
          </div>

          <p style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 12,
            color: '#5E6B7C',
            margin: 0,
            marginTop: 4,
            lineHeight: 1.5,
          }}>
            {t('alter_ego_week_offer.settings_note')}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
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
        <Button variant="ghost" size="md" onClick={onSkip}>
          <span className="btn__text">{t('alter_ego_week_offer.skip_button')}</span>
        </Button>
        <Button variant="opal" size="md" onClick={onAccept}>
          <span className="btn__text">{t('alter_ego_week_offer.start_button')}</span>
        </Button>
      </div>
    </div>
  );
}

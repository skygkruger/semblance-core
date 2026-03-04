import { useTranslation } from 'react-i18next';
import type { AutonomySelectorProps } from './AutonomySelector.types';
import { tiers } from './AutonomySelector.types';
import './AutonomySelector.css';

export function AutonomySelector({ value, onChange, className = '' }: AutonomySelectorProps) {
  const { t } = useTranslation('agent');
  return (
    <div className={`autonomy-selector ${className}`} role="radiogroup" aria-label={t('autonomy.selector_label')}>
      {tiers.map((tier) => {
        const isSelected = tier.id === value;
        const isRecommended = tier.id === 'partner';

        return (
          <button
            key={tier.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(tier.id)}
            className={[
              'autonomy-selector__card',
              isSelected ? 'autonomy-selector__card--selected' : '',
              isRecommended && !isSelected ? 'autonomy-selector__card--recommended' : '',
            ].filter(Boolean).join(' ')}
          >
            <div className="autonomy-selector__header">
              <span className="autonomy-selector__name">
                {t(`autonomy.${tier.id}.name`)}
              </span>
              {isRecommended && (
                <span className="autonomy-selector__badge">
                  {t('autonomy.recommended_badge')}
                </span>
              )}
            </div>
            <p className="autonomy-selector__desc">
              {t(`autonomy.${tier.id}.description`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { AutonomySelector } from '../../components/AutonomySelector/AutonomySelector';
import { Button } from '../../components/Button/Button';
import type { AutonomyTierProps } from './AutonomyTier.types';
import './Onboarding.css';

export function AutonomyTier({ value, onChange, onContinue }: AutonomyTierProps) {
  const { t } = useTranslation('onboarding');
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 480,
      width: '100%',
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <h2 className="naming__headline">
        {t('autonomy.headline')}
      </h2>
      <p className="naming__subtext" style={{ maxWidth: 360 }}>
        {t('autonomy.subtext')}
      </p>

      <div style={{ width: '100%', maxWidth: 400, textAlign: 'left' }}>
        <AutonomySelector value={value} onChange={onChange} />
      </div>

      <div style={{ marginTop: 8 }}>
        <Button variant="approve" onClick={onContinue}>{t('autonomy.continue_button')}</Button>
      </div>
    </div>
  );
}

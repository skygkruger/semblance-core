import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import type { NamingMomentProps } from './NamingMoment.types';
import './Onboarding.css';

export function NamingMoment({ onComplete, defaultValue = '' }: NamingMomentProps) {
  const { t } = useTranslation('onboarding');
  const [userName, setUserName] = useState(defaultValue);
  const hasValue = userName.trim().length > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 420,
      width: '100%',
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <LogoMark size={64} />

      <h1 className="naming__headline">
        {t('naming_moment.headline')}
      </h1>

      <div style={{ width: '100%' }}>
        <Input
          placeholder={t('naming_moment.placeholder')}
          value={userName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
        />
      </div>

      {hasValue && (
        <p className="naming__subtext" style={{ maxWidth: 300 }}>
          {t('naming_moment.confirmation', { name: userName.trim() })}
        </p>
      )}

      <div style={{ marginTop: 8 }}>
        <Button
          variant="approve"
          size="lg"
          disabled={!hasValue}
          onClick={() => onComplete?.(userName.trim())}
        >
          {t('naming_moment.continue_button')}
        </Button>
      </div>
    </div>
  );
}

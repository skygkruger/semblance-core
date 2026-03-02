import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import type { NamingYourAIProps } from './NamingYourAI.types';
import './Onboarding.css';

export function NamingYourAI({ onComplete, defaultValue = '' }: NamingYourAIProps) {
  const { t } = useTranslation('onboarding');
  const [aiName, setAiName] = useState(defaultValue);
  const hasValue = aiName.trim().length > 0;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      maxWidth: 420,
      width: '100%',
      animation: 'dissolve 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      <LogoMark size={80} />

      <h1 className="naming__headline">
        {t('naming_ai.headline')}
      </h1>

      <div style={{ width: '100%' }}>
        <Input
          placeholder={t('naming_ai.placeholder')}
          value={aiName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAiName(e.target.value)}
        />
      </div>

      <div className={`naming__ai-preview ${hasValue ? 'naming__ai-preview--visible' : ''}`}>
        {aiName || '\u00A0'}
      </div>

      <p className={`naming__ai-subtext ${hasValue ? 'naming__ai-subtext--visible' : ''}`}>
        {t('naming_ai.subtext')}
      </p>

      <div style={{ marginTop: 8 }}>
        <Button
          variant="approve"
          size="lg"
          disabled={!hasValue}
          onClick={() => onComplete?.(aiName.trim())}
        >
          {t('naming_ai.start_button')}
        </Button>
      </div>
    </div>
  );
}

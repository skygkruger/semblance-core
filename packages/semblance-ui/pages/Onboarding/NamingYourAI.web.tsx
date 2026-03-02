import { useState } from 'react';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import type { NamingYourAIProps } from './NamingYourAI.types';
import './Onboarding.css';

export function NamingYourAI({ onComplete, defaultValue = '' }: NamingYourAIProps) {
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
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <LogoMark size={80} />

      <h1 className="naming__headline">
        What will you call{' '}
        <em className="naming__pronoun">it</em>
        ?
      </h1>

      <div style={{ width: '100%' }}>
        <Input
          placeholder="Give it a name"
          value={aiName}
          onChange={e => setAiName(e.target.value)}
        />
      </div>

      <div className={`naming__ai-preview ${hasValue ? 'naming__ai-preview--visible' : ''}`}>
        {aiName || '\u00A0'}
      </div>

      <p className={`naming__ai-subtext ${hasValue ? 'naming__ai-subtext--visible' : ''}`}>
        This is what your AI will be called. You can change it in Settings.
      </p>

      <div style={{ marginTop: 8 }}>
        <Button
          variant="approve"
          size="lg"
          disabled={!hasValue}
          onClick={() => onComplete?.(aiName.trim())}
        >
          Start Semblance
        </Button>
      </div>
    </div>
  );
}

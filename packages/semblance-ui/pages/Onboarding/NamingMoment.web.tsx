import { useState } from 'react';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import type { NamingMomentProps } from './NamingMoment.types';
import './Onboarding.css';

export function NamingMoment({ onComplete, defaultValue = '' }: NamingMomentProps) {
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
        What should <em className="naming__pronoun">it</em> call you?
      </h1>

      <div style={{ width: '100%' }}>
        <Input
          placeholder="Your name or nickname"
          value={userName}
          onChange={e => setUserName(e.target.value)}
        />
      </div>

      {hasValue && (
        <p className="naming__subtext" style={{ maxWidth: 300 }}>
          Your Semblance will address you as {userName.trim()}.
          You can change this in Settings.
        </p>
      )}

      <div style={{ marginTop: 8 }}>
        <Button
          variant="approve"
          size="lg"
          disabled={!hasValue}
          onClick={() => onComplete?.(userName.trim())}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

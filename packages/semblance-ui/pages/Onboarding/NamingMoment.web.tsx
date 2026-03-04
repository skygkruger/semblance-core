import { useState } from 'react';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { PrivacyBadge } from '../../components/PrivacyBadge/PrivacyBadge';
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
      <LogoMark size={120} />

      <h1 className="onboarding-shimmer-headline" style={{ fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.25, marginBottom: 16 }}>
        What should it call you?
      </h1>
      <p className="naming__subtext">
        Stored only on your device. Never transmitted.
      </p>

      <div style={{ width: '100%' }}>
        <Input
          placeholder="Your name"
          value={userName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
        />
      </div>

      <PrivacyBadge status="active" />

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

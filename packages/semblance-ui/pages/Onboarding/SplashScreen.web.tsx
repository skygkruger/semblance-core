import { useEffect, useRef } from 'react';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Wordmark } from '../../components/Wordmark/Wordmark';
import { Button } from '../../components/Button/Button';
import type { SplashScreenProps } from './SplashScreen.types';
import './Onboarding.css';

export function SplashScreen({ onBegin, autoAdvanceMs = 0 }: SplashScreenProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoAdvanceMs > 0 && onBegin) {
      timerRef.current = setTimeout(onBegin, autoAdvanceMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoAdvanceMs, onBegin]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 24,
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <LogoMark size={200} />
      <Wordmark size="hero" />
      <p className="onboarding-shimmer-headline" style={{ fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
        Your intelligence. Your device. Your rules.
      </p>
      <div style={{ marginTop: 32 }}>
        <Button
          variant="approve"
          size="lg"
          onClick={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            onBegin?.();
          }}
        >
          Begin Setup
        </Button>
      </div>
    </div>
  );
}

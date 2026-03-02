import { useEffect, useRef } from 'react';
import { LogoMark } from '../../components/LogoMark/LogoMark';
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
      gap: 32,
      maxWidth: 480,
      width: '100%',
      animation: 'dissolve 700ms var(--eo) both',
    }}>
      <LogoMark size={96} />

      <h1 className="naming__headline">
        This is your Semblance.
      </h1>

      <p className="naming__subtext" style={{ maxWidth: 360 }}>
        A digital representation that understands your world,
        acts on your behalf, and is architecturally incapable
        of betraying your trust.
      </p>

      <div style={{ marginTop: 12 }}>
        <Button
          variant="approve"
          size="lg"
          onClick={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
            onBegin?.();
          }}
        >
          Begin
        </Button>
      </div>
    </div>
  );
}

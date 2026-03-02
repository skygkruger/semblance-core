// BiometricGate — Desktop biometric unlock gate.
//
// Wraps AppContent. On mount:
// 1. Check if biometric available
// 2. If yes → prompt "Unlock Semblance"
// 3. On success → render children
// 4. On failure → show retry UI
//
// If biometric not available (e.g. Linux, hardware absent) → auto-pass.
// Listens for Tauri window close event → clears session state.
//
// CRITICAL: Session state is in-memory only, never persisted.

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { BIOMETRIC_REASONS } from '@semblance/core/auth/types';
import { FeatureAuthContext } from '@semblance/ui';
import { createDesktopBiometricAuth } from './biometric';
import { sessionAuth } from './session';

interface BiometricGateProps {
  children: ReactNode;
}

const biometricAuth = createDesktopBiometricAuth();

export function BiometricGate({ children }: BiometricGateProps) {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const attemptUnlock = useCallback(async () => {
    setState('checking');
    setErrorMsg(null);

    try {
      const available = await biometricAuth.isAvailable();
      if (!available) {
        // No biometric hardware (Linux, or hardware absent) → auto-pass
        sessionAuth.markAuthenticated('app_launch');
        setState('unlocked');
        return;
      }

      const result = await biometricAuth.authenticate(BIOMETRIC_REASONS.app_launch);
      if (result.success) {
        sessionAuth.markAuthenticated('app_launch');
        setState('unlocked');
      } else if (result.error === 'cancelled') {
        setState('locked');
        setErrorMsg('Authentication cancelled');
      } else if (result.error === 'lockout') {
        setState('error');
        setErrorMsg('Too many failed attempts. Try again later.');
      } else {
        setState('locked');
        setErrorMsg('Authentication failed');
      }
    } catch {
      // Unexpected error → auto-pass to avoid locking user out
      sessionAuth.markAuthenticated('app_launch');
      setState('unlocked');
    }
  }, []);

  useEffect(() => {
    attemptUnlock();
  }, [attemptUnlock]);

  // Listen for window close → clear session
  useEffect(() => {
    const appWindow = getCurrentWindow();
    const unlistenPromise = appWindow.onCloseRequested(() => {
      sessionAuth.clearAll();
    });

    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  if (state === 'checking') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#0B0E11',
          color: '#8593A4',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        <p>Verifying identity...</p>
      </div>
    );
  }

  if (state === 'locked' || state === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#0B0E11',
          color: '#E8E3E3',
          fontFamily: "'DM Sans', system-ui, sans-serif",
          gap: '16px',
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6ECFA3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Semblance is locked</h2>
        {errorMsg && (
          <p style={{ color: '#8593A4', fontSize: '14px', margin: 0 }}>{errorMsg}</p>
        )}
        <button
          type="button"
          onClick={attemptUnlock}
          disabled={state === 'error'}
          style={{
            marginTop: '8px',
            padding: '10px 24px',
            backgroundColor: state === 'error' ? '#2a2a2a' : '#6ECFA3',
            color: state === 'error' ? '#8593A4' : '#0B0E11',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: state === 'error' ? 'not-allowed' : 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}
        >
          {state === 'error' ? 'Locked out' : 'Try again'}
        </button>
      </div>
    );
  }

  // Provide biometric auth + session state to all children via context
  const featureAuthValue = useMemo(() => ({
    biometricAuth,
    sessionAuth,
  }), []);

  return (
    <FeatureAuthContext.Provider value={featureAuthValue}>
      {children}
    </FeatureAuthContext.Provider>
  );
}

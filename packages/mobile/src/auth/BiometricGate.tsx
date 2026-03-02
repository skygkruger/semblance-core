// BiometricGate — Mobile biometric unlock gate.
//
// On mount: check biometric available → prompt → render children on success.
// On app background: clear session → re-prompt on foreground.
//
// iOS: Face ID / Touch ID / device passcode (via allowDeviceCredentials).
// Android: Fingerprint / face / PIN (via allowDeviceCredentials).
//
// CRITICAL: Session state is in-memory only, never persisted.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, Pressable, AppState, StyleSheet, type AppStateStatus } from 'react-native';
import { BIOMETRIC_REASONS } from '@semblance/core/auth/types';
import { FeatureAuthContext } from '@semblance/ui';
import { createMobileBiometricAuth } from './biometric';
import { sessionAuth } from './session';

interface BiometricGateProps {
  children: React.ReactNode;
}

const biometricAuth = createMobileBiometricAuth();

export function BiometricGate({ children }: BiometricGateProps) {
  const [state, setState] = useState<'checking' | 'locked' | 'unlocked' | 'error'>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const attemptUnlock = useCallback(async () => {
    setState('checking');
    setErrorMsg(null);

    try {
      const available = await biometricAuth.isAvailable();
      if (!available) {
        // No biometric/passcode available → auto-pass (shouldn't happen on iOS/Android,
        // but don't lock the user out)
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

  // Listen for app background → clear session → re-prompt on foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev.match(/active/) && nextState.match(/inactive|background/)) {
        // Going to background: clear session
        sessionAuth.clearAll();
        setState('locked');
      } else if (prev.match(/inactive|background/) && nextState === 'active') {
        // Returning to foreground: re-authenticate
        attemptUnlock();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [attemptUnlock]);

  if (state === 'checking') {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Verifying identity...</Text>
      </View>
    );
  }

  if (state === 'locked' || state === 'error') {
    return (
      <View style={styles.container}>
        <View style={styles.lockIcon}>
          <Text style={styles.lockEmoji}>*</Text>
        </View>
        <Text style={styles.title}>Semblance is locked</Text>
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        <Pressable
          onPress={attemptUnlock}
          disabled={state === 'error'}
          style={({ pressed }) => [
            styles.button,
            state === 'error' && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text
            style={[
              styles.buttonText,
              state === 'error' && styles.buttonTextDisabled,
            ]}
          >
            {state === 'error' ? 'Locked out' : 'Try again'}
          </Text>
        </Pressable>
      </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0E11',
    paddingHorizontal: 32,
  },
  statusText: {
    color: '#8593A4',
    fontSize: 16,
    fontFamily: 'System',
  },
  lockIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(110, 207, 163, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockEmoji: {
    fontSize: 28,
    color: '#6ECFA3',
  },
  title: {
    color: '#E8E3E3',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    color: '#8593A4',
    fontSize: 14,
    marginBottom: 8,
  },
  button: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#6ECFA3',
    borderRadius: 8,
  },
  buttonDisabled: {
    backgroundColor: '#2a2a2a',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#0B0E11',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: '#8593A4',
  },
});

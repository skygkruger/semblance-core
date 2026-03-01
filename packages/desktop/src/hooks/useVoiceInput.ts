// useVoiceInput — Desktop hook bridging VoiceAdapter to AgentInput voice props.
//
// Checks adapter readiness on mount. Returns voiceEnabled=false if STT not ready.
// Manages voice state machine: idle → listening → processing → idle.
// Error state auto-recovers to idle after 3 seconds.
//
// CRITICAL: No network imports. Voice processing is local.

import { useState, useCallback, useEffect, useRef } from 'react';
import type { VoiceAdapter, AudioSession } from '@semblance/core/platform/voice-types';

export type VoiceInputState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface UseVoiceInputReturn {
  voiceEnabled: boolean;
  voiceState: VoiceInputState;
  audioLevel: number;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onVoiceCancel: () => void;
  lastTranscription: string | null;
}

export function useVoiceInput(adapter: VoiceAdapter): UseVoiceInputReturn {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceInputState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastTranscription, setLastTranscription] = useState<string | null>(null);

  const sessionRef = useRef<AudioSession | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Check adapter readiness on mount
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    adapter.isSTTReady().then((ready) => {
      if (!cancelled && mountedRef.current) {
        setVoiceEnabled(ready);
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;

      // Cleanup active session on unmount
      if (sessionRef.current) {
        sessionRef.current.cancel().catch(() => {});
        sessionRef.current = null;
      }
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }

      adapter.releaseModels().catch(() => {});
    };
  }, [adapter]);

  const setErrorWithRecovery = useCallback(() => {
    setVoiceState('error');
    setAudioLevel(0);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setVoiceState('idle');
      }
    }, 3000);
  }, []);

  const onVoiceStart = useCallback(async () => {
    if (!voiceEnabled) return;

    try {
      // Request mic permission if needed
      const hasPerm = await adapter.hasMicrophonePermission();
      if (!hasPerm) {
        const granted = await adapter.requestMicrophonePermission();
        if (!granted) {
          setErrorWithRecovery();
          return;
        }
      }

      const session = await adapter.startCapture();
      sessionRef.current = session;
      setVoiceState('listening');
      // audioLevel stays at 0 until real adapter provides audio callback
      setAudioLevel(0);
    } catch {
      setErrorWithRecovery();
    }
  }, [voiceEnabled, adapter, setErrorWithRecovery]);

  const onVoiceStop = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    setVoiceState('processing');
    setAudioLevel(0);

    try {
      const audio = await session.stop();
      sessionRef.current = null;

      const result = await adapter.transcribe(audio);
      if (mountedRef.current) {
        setLastTranscription(result.text);
        setVoiceState('idle');
      }
    } catch {
      sessionRef.current = null;
      if (mountedRef.current) {
        setErrorWithRecovery();
      }
    }
  }, [adapter, setErrorWithRecovery]);

  const onVoiceCancel = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      await session.cancel().catch(() => {});
      sessionRef.current = null;
    }

    // Also stop any TTS playback
    await adapter.stopPlayback().catch(() => {});

    if (mountedRef.current) {
      setVoiceState('idle');
      setAudioLevel(0);
    }
  }, [adapter]);

  return {
    voiceEnabled,
    voiceState,
    audioLevel,
    onVoiceStart,
    onVoiceStop,
    onVoiceCancel,
    lastTranscription,
  };
}

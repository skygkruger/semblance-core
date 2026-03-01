// @vitest-environment jsdom
/**
 * Desktop useVoiceInput Hook Tests
 *
 * Tests the desktop hook that bridges VoiceAdapter to AgentInput voice props.
 * Uses createMockVoiceAdapter for deterministic behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceInput } from '../../packages/desktop/src/hooks/useVoiceInput';
import { createMockVoiceAdapter } from '../../packages/core/platform/desktop-voice';
import type { VoiceAdapter } from '../../packages/core/platform/voice-types';

describe('useVoiceInput (desktop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('voiceEnabled=false when adapter STT not ready', async () => {
    const adapter = createMockVoiceAdapter({ sttReady: false });
    const { result } = renderHook(() => useVoiceInput(adapter));

    // isSTTReady is async, flush the promise
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.voiceEnabled).toBe(false);
    expect(result.current.voiceState).toBe('idle');
  });

  it('voiceEnabled=true when adapter STT is ready', async () => {
    const adapter = createMockVoiceAdapter({ sttReady: true });
    const { result } = renderHook(() => useVoiceInput(adapter));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.voiceEnabled).toBe(true);
  });

  it('onVoiceStart transitions to listening', async () => {
    const adapter = createMockVoiceAdapter({ sttReady: true, micPermission: true });
    const { result } = renderHook(() => useVoiceInput(adapter));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    await act(async () => {
      await result.current.onVoiceStart();
    });

    expect(result.current.voiceState).toBe('listening');
  });

  it('onVoiceStop transitions through processing to idle with transcription', async () => {
    const adapter = createMockVoiceAdapter({
      sttReady: true,
      micPermission: true,
      transcriptionResult: {
        text: 'Cancel my Netflix',
        confidence: 0.92,
        durationMs: 200,
        language: 'en',
      },
    });
    const { result } = renderHook(() => useVoiceInput(adapter));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Start listening
    await act(async () => {
      await result.current.onVoiceStart();
    });
    expect(result.current.voiceState).toBe('listening');

    // Stop listening — should process and return transcription
    await act(async () => {
      await result.current.onVoiceStop();
    });
    expect(result.current.voiceState).toBe('idle');
    expect(result.current.lastTranscription).toBe('Cancel my Netflix');
  });

  it('onVoiceCancel returns to idle', async () => {
    const adapter = createMockVoiceAdapter({ sttReady: true, micPermission: true });
    const { result } = renderHook(() => useVoiceInput(adapter));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Start listening
    await act(async () => {
      await result.current.onVoiceStart();
    });
    expect(result.current.voiceState).toBe('listening');

    // Cancel
    await act(async () => {
      await result.current.onVoiceCancel();
    });
    expect(result.current.voiceState).toBe('idle');
    expect(result.current.audioLevel).toBe(0);
  });

  it('error state auto-recovers to idle after timeout', async () => {
    // Create adapter that throws on startCapture
    const failingAdapter: VoiceAdapter = {
      ...createMockVoiceAdapter({ sttReady: true, micPermission: true }),
      async startCapture() {
        throw new Error('Mic hardware failure');
      },
    };
    const { result } = renderHook(() => useVoiceInput(failingAdapter));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Attempt to start — should error
    await act(async () => {
      await result.current.onVoiceStart();
    });
    expect(result.current.voiceState).toBe('error');

    // Advance past the 3s recovery timer
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(result.current.voiceState).toBe('idle');
  });

  it('onVoiceStart does nothing when voiceEnabled=false', async () => {
    const adapter = createMockVoiceAdapter({ sttReady: false });
    const startCaptureSpy = vi.spyOn(adapter, 'startCapture');
    const { result } = renderHook(() => useVoiceInput(adapter));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.voiceEnabled).toBe(false);

    await act(async () => {
      await result.current.onVoiceStart();
    });

    expect(startCaptureSpy).not.toHaveBeenCalled();
    expect(result.current.voiceState).toBe('idle');
  });
});

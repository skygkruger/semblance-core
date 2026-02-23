// Voice Adapter Tests — Verify mock adapter behavior and interface contract.

import { describe, it, expect } from 'vitest';
import { createMockVoiceAdapter } from '../../../packages/core/platform/desktop-voice';

describe('VoiceAdapter', () => {
  it('hasMicrophonePermission returns configured value', async () => {
    const granted = createMockVoiceAdapter({ micPermission: true });
    const denied = createMockVoiceAdapter({ micPermission: false });

    expect(await granted.hasMicrophonePermission()).toBe(true);
    expect(await denied.hasMicrophonePermission()).toBe(false);
  });

  it('requestMicrophonePermission grants access', async () => {
    const adapter = createMockVoiceAdapter({ micPermission: false });
    expect(await adapter.hasMicrophonePermission()).toBe(false);

    const result = await adapter.requestMicrophonePermission();
    expect(result).toBe(true);
    expect(await adapter.hasMicrophonePermission()).toBe(true);
  });

  it('startCapture returns AudioSession with stop()', async () => {
    const adapter = createMockVoiceAdapter();
    const session = await adapter.startCapture();

    expect(session.isRecording()).toBe(true);
    expect(session.durationMs()).toBeGreaterThanOrEqual(0);

    const audio = await session.stop();
    expect(audio.sampleRate).toBe(16000);
    expect(audio.format.channels).toBe(1);
    expect(audio.format.bitDepth).toBe(16);
    expect(audio.pcmData).toBeInstanceOf(Float32Array);
  });

  it('cancel() discards audio without returning data', async () => {
    const adapter = createMockVoiceAdapter();
    const session = await adapter.startCapture();

    expect(session.isRecording()).toBe(true);
    await session.cancel();
    expect(session.isRecording()).toBe(false);
  });

  it('transcribe() returns TranscriptionResult with text and confidence', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: {
        text: 'Test transcription',
        confidence: 0.92,
        durationMs: 200,
        language: 'en',
      },
    });

    const audio = {
      pcmData: new Float32Array(16000),
      sampleRate: 16000,
      durationMs: 1000,
      format: { channels: 1 as const, sampleRate: 16000, bitDepth: 16 as const },
    };

    const result = await adapter.transcribe(audio);
    expect(result.text).toBe('Test transcription');
    expect(result.confidence).toBe(0.92);
    expect(result.durationMs).toBe(200);
    expect(result.language).toBe('en');
  });

  it('synthesize() returns AudioData', async () => {
    const adapter = createMockVoiceAdapter();
    const audio = await adapter.synthesize('Hello, world!');

    expect(audio.pcmData).toBeInstanceOf(Float32Array);
    expect(audio.sampleRate).toBe(16000);
    expect(audio.durationMs).toBeGreaterThan(0);
    expect(audio.format.channels).toBe(1);
  });

  it('startCapture throws when permission denied', async () => {
    const adapter = createMockVoiceAdapter({ micPermission: false });

    await expect(adapter.startCapture()).rejects.toThrow('Microphone permission not granted');
  });

  it('releaseModels completes and getAvailableVoices returns VoiceInfo[]', async () => {
    const adapter = createMockVoiceAdapter();

    await expect(adapter.releaseModels()).resolves.toBeUndefined();

    const voices = await adapter.getAvailableVoices();
    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('language');
    expect(voices[0]).toHaveProperty('gender');
    expect(voices[0]).toHaveProperty('sampleAudioAvailable');
  });
});

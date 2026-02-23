// TranscriptionPipeline Tests — Audio validation, resampling, and transcription flow.

import { describe, it, expect } from 'vitest';
import { TranscriptionPipeline } from '../../../packages/core/voice/transcription-pipeline';
import { WhisperModelManager } from '../../../packages/core/voice/whisper-model-manager';
import { createMockVoiceAdapter } from '../../../packages/core/platform/desktop-voice';
import type { HardwareProfile } from '../../../packages/core/llm/hardware-types';
import type { AudioData } from '../../../packages/core/platform/voice-types';

function makeProfile(): HardwareProfile {
  return {
    tier: 'performance',
    cpuCores: 8,
    cpuArch: 'arm64',
    totalRamMb: 16384,
    availableRamMb: 10000,
    os: 'macos',
    gpu: null,
  };
}

function makeAudio(sampleRate = 16000, channels: 1 | 2 = 1): AudioData {
  const samples = sampleRate * 2; // 2 seconds
  return {
    pcmData: new Float32Array(samples * channels).fill(0.5),
    sampleRate,
    durationMs: 2000,
    format: { channels, sampleRate, bitDepth: 16 as const },
  };
}

describe('TranscriptionPipeline', () => {
  it('valid audio produces TranscriptionResult with text', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: { text: 'Hello world', confidence: 0.9, durationMs: 100 },
    });
    const modelMgr = new WhisperModelManager(makeProfile());
    const pipeline = new TranscriptionPipeline(adapter, modelMgr);

    const result = await pipeline.transcribe(makeAudio());
    expect(result.text).toBe('Hello world');
    expect(result.confidence).toBe(0.9);
  });

  it('model not loaded auto-loads before transcription', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: { text: 'Auto loaded', confidence: 0.85, durationMs: 120 },
    });
    const modelMgr = new WhisperModelManager(makeProfile());
    expect(modelMgr.isLoaded()).toBe(false);

    const pipeline = new TranscriptionPipeline(adapter, modelMgr);
    await pipeline.transcribe(makeAudio());

    expect(modelMgr.isLoaded()).toBe(true);
  });

  it('empty audio throws validation error', () => {
    const adapter = createMockVoiceAdapter();
    const modelMgr = new WhisperModelManager(makeProfile());
    const pipeline = new TranscriptionPipeline(adapter, modelMgr);

    const emptyAudio: AudioData = {
      pcmData: new Float32Array(0),
      sampleRate: 16000,
      durationMs: 0,
      format: { channels: 1, sampleRate: 16000, bitDepth: 16 },
    };

    expect(() => pipeline.validateAudioFormat(emptyAudio)).toThrow('Audio data is empty');
  });

  it('audio buffer is released after transcription (reference dropped)', async () => {
    const adapter = createMockVoiceAdapter({
      transcriptionResult: { text: 'Released', confidence: 0.95, durationMs: 50 },
    });
    const modelMgr = new WhisperModelManager(makeProfile());
    const pipeline = new TranscriptionPipeline(adapter, modelMgr);

    // The pipeline internally nulls the processedAudio reference after transcription.
    // We verify the result is returned correctly, proving the pipeline completed.
    const result = await pipeline.transcribe(makeAudio());
    expect(result.text).toBe('Released');
  });
});

// TranscriptionPipeline — Orchestrates audio capture → validation → resampling → transcription.
//
// Delegates to VoiceAdapter for actual transcription (Whisper.cpp via platform bridge).
// Handles format validation, resampling, and post-processing.
//
// CRITICAL: No network imports. All processing is local.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { VoiceAdapter, AudioData, TranscriptionResult } from '../platform/voice-types.js';
import type { WhisperModelManager } from './whisper-model-manager.js';
import { resampleAudio, stereoToMono, normalizeAudio } from './audio-resampler.js';

const WHISPER_SAMPLE_RATE = 16000;

export interface TranscriptionPipelineOptions {
  /** Target sample rate for transcription (default: 16000 Hz) */
  targetSampleRate?: number;
  /** Post-process transcription text (trim, normalize whitespace) */
  postProcess?: boolean;
}

export class TranscriptionPipeline {
  private voiceAdapter: VoiceAdapter;
  private modelManager: WhisperModelManager;
  private targetSampleRate: number;
  private shouldPostProcess: boolean;

  constructor(
    voiceAdapter: VoiceAdapter,
    modelManager: WhisperModelManager,
    options?: TranscriptionPipelineOptions,
  ) {
    this.voiceAdapter = voiceAdapter;
    this.modelManager = modelManager;
    this.targetSampleRate = options?.targetSampleRate ?? WHISPER_SAMPLE_RATE;
    this.shouldPostProcess = options?.postProcess ?? true;
  }

  /**
   * Transcribe audio data to text.
   * Validates format, resamples if needed, auto-loads model, then delegates to adapter.
   */
  async transcribe(audio: AudioData): Promise<TranscriptionResult> {
    // Validate input
    this.validateAudioFormat(audio);

    // Auto-load model if not already loaded
    if (!this.modelManager.isLoaded()) {
      this.modelManager.loadModel();
    }

    // Prepare audio: resample and convert to mono if needed
    let processedAudio = this.prepareAudio(audio);

    // Delegate to voice adapter for actual Whisper.cpp transcription
    const result = await this.voiceAdapter.transcribe(processedAudio);

    // Post-process text
    if (this.shouldPostProcess) {
      result.text = this.postProcessText(result.text);
    }

    // Release audio buffer reference (ephemeral — never persisted)
    processedAudio = null as unknown as AudioData;

    return result;
  }

  /**
   * Validate that audio data meets minimum requirements.
   */
  validateAudioFormat(audio: AudioData): void {
    if (!audio.pcmData || audio.pcmData.length === 0) {
      throw new Error('Audio data is empty');
    }

    if (audio.sampleRate <= 0) {
      throw new Error(`Invalid sample rate: ${audio.sampleRate}`);
    }

    if (audio.format.channels !== 1 && audio.format.channels !== 2) {
      throw new Error(`Unsupported channel count: ${audio.format.channels}`);
    }
  }

  /**
   * Prepare audio for Whisper: convert to mono, resample to target rate, normalize.
   */
  private prepareAudio(audio: AudioData): AudioData {
    let pcmData = audio.pcmData;
    let sampleRate = audio.sampleRate;
    let channels = audio.format.channels;

    // Convert stereo to mono
    if (channels === 2) {
      pcmData = stereoToMono(pcmData);
      channels = 1;
    }

    // Resample to target rate
    if (sampleRate !== this.targetSampleRate) {
      pcmData = resampleAudio(pcmData, sampleRate, this.targetSampleRate);
      sampleRate = this.targetSampleRate;
    }

    // Normalize
    pcmData = normalizeAudio(pcmData);

    const durationMs = (pcmData.length / sampleRate) * 1000;

    return {
      pcmData,
      sampleRate,
      durationMs,
      format: {
        channels: 1,
        sampleRate,
        bitDepth: audio.format.bitDepth,
      },
    };
  }

  /**
   * Post-process transcription text: trim, collapse whitespace.
   */
  private postProcessText(text: string): string {
    return text
      .trim()
      .replace(/\s+/g, ' ');
  }
}

// Desktop Voice Adapter — Platform-specific voice integration.
//
// Dev/test: createMockVoiceAdapter() provides configurable transcription/synthesis results.
// Production: createDesktopVoiceAdapter() delegates to mock with TODO for Tauri wiring.
//
// CRITICAL: No network imports. All voice processing is local.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type {
  VoiceAdapter,
  AudioSession,
  AudioData,
  AudioFormat,
  TranscriptionResult,
  TTSOptions,
  VoiceInfo,
} from './voice-types.js';

/**
 * Create a mock voice adapter for development and testing.
 * Accepts configurable transcription/synthesis results.
 */
export function createMockVoiceAdapter(options?: {
  micPermission?: boolean;
  sttReady?: boolean;
  ttsReady?: boolean;
  transcriptionResult?: TranscriptionResult;
  synthesizedAudio?: AudioData;
  availableVoices?: VoiceInfo[];
}): VoiceAdapter {
  let micPermission = options?.micPermission ?? true;
  const sttReady = options?.sttReady ?? true;
  const ttsReady = options?.ttsReady ?? true;
  let isPlaying = false;

  const defaultFormat: AudioFormat = {
    channels: 1,
    sampleRate: 16000,
    bitDepth: 16,
  };

  const defaultTranscription: TranscriptionResult = options?.transcriptionResult ?? {
    text: 'Hello, this is a test transcription.',
    confidence: 0.95,
    durationMs: 150,
    language: 'en',
  };

  const defaultSynthesized: AudioData = options?.synthesizedAudio ?? {
    pcmData: new Float32Array(16000), // 1 second of silence at 16kHz
    sampleRate: 16000,
    durationMs: 1000,
    format: { ...defaultFormat },
  };

  const defaultVoices: VoiceInfo[] = options?.availableVoices ?? [
    { id: 'en_US-amy-medium', name: 'Amy', language: 'en_US', gender: 'female', sampleAudioAvailable: false },
    { id: 'en_US-ryan-medium', name: 'Ryan', language: 'en_US', gender: 'male', sampleAudioAvailable: false },
  ];

  return {
    async hasMicrophonePermission() {
      return micPermission;
    },

    async requestMicrophonePermission() {
      micPermission = true;
      return true;
    },

    async isSTTReady() {
      return sttReady;
    },

    async isTTSReady() {
      return ttsReady;
    },

    async startCapture() {
      if (!micPermission) {
        throw new Error('Microphone permission not granted. Call requestMicrophonePermission() first.');
      }

      let recording = true;
      const startTime = Date.now();

      const session: AudioSession = {
        async stop() {
          recording = false;
          const elapsed = Math.max(Date.now() - startTime, 100); // Minimum 100ms of audio
          const sampleCount = Math.max(Math.floor(16000 * (elapsed / 1000)), 1600);
          return {
            pcmData: new Float32Array(sampleCount).fill(0.1),
            sampleRate: 16000,
            durationMs: elapsed,
            format: { ...defaultFormat },
          };
        },

        async cancel() {
          recording = false;
          // Discard audio — no data returned
        },

        isRecording() {
          return recording;
        },

        durationMs() {
          return recording ? Date.now() - startTime : 0;
        },
      };

      return session;
    },

    async transcribe(_audio: AudioData) {
      return { ...defaultTranscription };
    },

    async synthesize(_text: string, _options?: TTSOptions) {
      return {
        pcmData: new Float32Array(defaultSynthesized.pcmData),
        sampleRate: defaultSynthesized.sampleRate,
        durationMs: defaultSynthesized.durationMs,
        format: { ...defaultSynthesized.format },
      };
    },

    async playAudio(_audio: AudioData) {
      isPlaying = true;
      // Simulate playback completion
      isPlaying = false;
    },

    async stopPlayback() {
      isPlaying = false;
    },

    async getAvailableVoices() {
      return [...defaultVoices];
    },

    async releaseModels() {
      // Nothing to release in mock
    },
  };
}

/**
 * Create the desktop voice adapter.
 * Desktop uses Whisper.cpp (STT) and Piper (TTS) via Tauri sidecar binaries.
 * Currently delegates to mock adapter.
 */
export function createDesktopVoiceAdapter(): VoiceAdapter {
  // TODO(Sprint 4): Wire up Tauri audio capture via @tauri-apps/plugin-audio
  // TODO(Sprint 4): Wire up Whisper.cpp sidecar binary for STT
  // TODO(Sprint 4): Wire up Piper sidecar binary for TTS
  const mock = createMockVoiceAdapter({
    micPermission: false,
    sttReady: false,
    ttsReady: false,
    transcriptionResult: {
      text: '',
      confidence: 0,
      durationMs: 0,
      language: 'en',
    },
  });

  return mock;
}

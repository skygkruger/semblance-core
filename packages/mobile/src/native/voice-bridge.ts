// Mobile Voice Bridge — React Native adapter for voice interaction.
//
// iOS: React Native Audio API + native Whisper.cpp/Piper modules via native bridge.
// Android: Same native module pattern.
//
// CRITICAL: No network imports. All voice processing is local on-device.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type {
  VoiceAdapter,
  AudioSession,
  AudioData,
  AudioFormat,
  TranscriptionResult,
  TTSOptions,
  VoiceInfo,
} from '@semblance/core/platform/voice-types';

/**
 * Shape of the native Whisper.cpp module.
 */
interface NativeWhisperModule {
  loadModel(modelPath: string): Promise<boolean>;
  unloadModel(): Promise<void>;
  isLoaded(): Promise<boolean>;
  transcribe(audioData: Float32Array, sampleRate: number): Promise<{
    text: string;
    confidence: number;
    processingMs: number;
    language?: string;
    segments?: Array<{ text: string; startMs: number; endMs: number; confidence: number }>;
  }>;
}

/**
 * Shape of the native Piper TTS module.
 */
interface NativePiperModule {
  loadVoice(modelPath: string, configPath: string): Promise<boolean>;
  unloadVoice(): Promise<void>;
  isLoaded(): Promise<boolean>;
  synthesize(text: string, speed: number): Promise<{ pcmData: Float32Array; sampleRate: number; durationMs: number }>;
  listVoices(modelsDir: string): Promise<Array<{ id: string; name: string; language: string; gender: string }>>;
}

/**
 * Shape of the native audio capture module.
 */
interface NativeAudioCaptureModule {
  startRecording(sampleRate: number, channels: number): Promise<void>;
  stopRecording(): Promise<{ pcmData: Float32Array; durationMs: number }>;
  cancelRecording(): Promise<void>;
  isRecording(): boolean;
  playAudio(pcmData: Float32Array, sampleRate: number): Promise<void>;
  stopPlayback(): Promise<void>;
  hasMicPermission(): Promise<boolean>;
  requestMicPermission(): Promise<boolean>;
}

/**
 * Create the React Native voice adapter.
 * iOS: Native Whisper.cpp + Piper modules.
 * Android: Same via JNI/NDK.
 */
export function createMobileVoiceAdapter(platform: 'ios' | 'android'): VoiceAdapter {
  let whisper: NativeWhisperModule | null = null;
  let piper: NativePiperModule | null = null;
  let audioCapture: NativeAudioCaptureModule | null = null;

  function getWhisper(): NativeWhisperModule | null {
    if (!whisper) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        whisper = require('react-native-whisper-cpp').default;
      } catch {
        return null;
      }
    }
    return whisper;
  }

  function getPiper(): NativePiperModule | null {
    if (!piper) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        piper = require('react-native-piper-tts').default;
      } catch {
        return null;
      }
    }
    return piper;
  }

  function getAudioCapture(): NativeAudioCaptureModule | null {
    if (!audioCapture) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        audioCapture = require('react-native-audio-capture').default;
      } catch {
        return null;
      }
    }
    return audioCapture;
  }

  const defaultFormat: AudioFormat = {
    channels: 1,
    sampleRate: 16000,
    bitDepth: 16,
  };

  const adapter: VoiceAdapter = {
    async hasMicrophonePermission() {
      const capture = getAudioCapture();
      if (!capture) return false;
      return capture.hasMicPermission();
    },

    async requestMicrophonePermission() {
      const capture = getAudioCapture();
      if (!capture) return false;
      return capture.requestMicPermission();
    },

    async isSTTReady() {
      const w = getWhisper();
      if (!w) return false;
      return w.isLoaded();
    },

    async isTTSReady() {
      const p = getPiper();
      if (!p) return false;
      return p.isLoaded();
    },

    async startCapture() {
      const capture = getAudioCapture();
      if (!capture) {
        throw new Error('Audio capture module not available on this device.');
      }

      const hasPerm = await capture.hasMicPermission();
      if (!hasPerm) {
        throw new Error('Microphone permission not granted. Call requestMicrophonePermission() first.');
      }

      await capture.startRecording(16000, 1);
      const startTime = Date.now();

      const session: AudioSession = {
        async stop() {
          const result = await capture.stopRecording();
          return {
            pcmData: result.pcmData,
            sampleRate: 16000,
            durationMs: result.durationMs,
            format: { ...defaultFormat },
          };
        },

        async cancel() {
          await capture.cancelRecording();
        },

        isRecording() {
          return capture.isRecording();
        },

        durationMs() {
          return Date.now() - startTime;
        },
      };

      return session;
    },

    async transcribe(audio: AudioData) {
      const w = getWhisper();
      if (!w) {
        throw new Error('Whisper.cpp module not available on this device.');
      }

      const result = await w.transcribe(audio.pcmData, audio.sampleRate);
      const transcription: TranscriptionResult = {
        text: result.text,
        confidence: result.confidence,
        durationMs: result.processingMs,
        language: result.language,
        segments: result.segments?.map(s => ({
          text: s.text,
          startMs: s.startMs,
          endMs: s.endMs,
          confidence: s.confidence,
        })),
      };
      return transcription;
    },

    async synthesize(text: string, options?: TTSOptions) {
      const p = getPiper();
      if (!p) {
        throw new Error('Piper TTS module not available on this device.');
      }

      const speed = options?.speed ?? 1.0;
      const result = await p.synthesize(text, speed);
      return {
        pcmData: result.pcmData,
        sampleRate: result.sampleRate,
        durationMs: result.durationMs,
        format: { ...defaultFormat, sampleRate: result.sampleRate },
      };
    },

    async playAudio(audio: AudioData) {
      const capture = getAudioCapture();
      if (!capture) {
        throw new Error('Audio playback module not available on this device.');
      }
      await capture.playAudio(audio.pcmData, audio.sampleRate);
    },

    async stopPlayback() {
      const capture = getAudioCapture();
      if (!capture) return;
      await capture.stopPlayback();
    },

    async getAvailableVoices() {
      const p = getPiper();
      if (!p) return [];
      // TODO(Sprint 4): Wire up models directory path from app storage
      const voices = await p.listVoices('/models/piper');
      return voices.map(v => ({
        id: v.id,
        name: v.name,
        language: v.language,
        gender: v.gender as VoiceInfo['gender'],
        sampleAudioAvailable: false,
      }));
    },

    async releaseModels() {
      const w = getWhisper();
      const p = getPiper();
      if (w) await w.unloadModel();
      if (p) await p.unloadVoice();
    },
  };

  return adapter;
}

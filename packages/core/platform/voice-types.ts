// Voice types — all audio processing local-only, no cloud speech APIs.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

/** Adapter for local voice interaction: STT via Whisper.cpp, TTS via Piper. */
export interface VoiceAdapter {
  /** Check if microphone permission has been granted */
  hasMicrophonePermission(): Promise<boolean>;

  /** Request microphone permission from the OS. Returns whether granted. */
  requestMicrophonePermission(): Promise<boolean>;

  /** Check if STT model is loaded and ready */
  isSTTReady(): Promise<boolean>;

  /** Check if TTS model is loaded and ready */
  isTTSReady(): Promise<boolean>;

  /**
   * Start audio capture from microphone.
   * Returns an AudioSession that accumulates audio data.
   * Caller is responsible for calling session.stop() to end capture.
   */
  startCapture(): Promise<AudioSession>;

  /**
   * Transcribe audio data to text using Whisper.cpp.
   * Accepts raw audio (PCM 16kHz mono).
   * Returns transcription result with timing and confidence.
   */
  transcribe(audio: AudioData): Promise<TranscriptionResult>;

  /**
   * Synthesize text to speech using Piper TTS.
   * Returns audio data that can be played back.
   */
  synthesize(text: string, options?: TTSOptions): Promise<AudioData>;

  /**
   * Play audio data through the device speaker/headphones.
   * Returns a promise that resolves when playback completes.
   */
  playAudio(audio: AudioData): Promise<void>;

  /** Stop any currently playing audio. */
  stopPlayback(): Promise<void>;

  /** Get available TTS voices. */
  getAvailableVoices(): Promise<VoiceInfo[]>;

  /**
   * Release STT/TTS model resources to free memory.
   * Called when voice mode is deactivated or on memory pressure.
   */
  releaseModels(): Promise<void>;
}

/** Represents an active audio recording session. */
export interface AudioSession {
  /** Stop recording and return captured audio */
  stop(): Promise<AudioData>;

  /** Cancel recording without returning data (discard audio) */
  cancel(): Promise<void>;

  /** Whether recording is currently active */
  isRecording(): boolean;

  /** Duration of recording so far in milliseconds */
  durationMs(): number;
}

/** Raw audio data container — ephemeral, never persisted to disk. */
export interface AudioData {
  /** Raw PCM audio data */
  pcmData: Float32Array;

  /** Sample rate in Hz */
  sampleRate: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Audio format metadata */
  format: AudioFormat;
}

export interface AudioFormat {
  channels: 1 | 2;
  sampleRate: number;
  bitDepth: 16 | 32;
}

export interface TranscriptionResult {
  text: string;
  confidence: number; // 0-1
  durationMs: number; // Processing time
  language?: string; // Detected language
  segments?: TranscriptionSegment[]; // Word-level timing if available
}

export interface TranscriptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface TTSOptions {
  voiceId?: string;
  speed?: number; // 0.5-2.0, default 1.0
  pitch?: number; // 0.5-2.0, default 1.0
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  sampleAudioAvailable: boolean;
}

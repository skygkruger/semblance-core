// SpeechSynthesisPipeline — Orchestrates text preprocessing → synthesis → playback.
//
// Delegates to VoiceAdapter for actual Piper TTS synthesis and audio playback.
// Handles text preprocessing and sentence chunking.
//
// CRITICAL: No network imports. All processing is local.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { VoiceAdapter, AudioData, TTSOptions } from '../platform/voice-types.js';
import type { PiperModelManager } from './piper-model-manager.js';
import { preprocessForTTS, splitIntoSentences } from './tts-preprocessor.js';

export interface SpeakResult {
  /** Whether playback completed (false if interrupted by stop()) */
  completed: boolean;
  /** Total duration of audio generated in ms */
  totalDurationMs: number;
  /** Number of sentences processed */
  sentenceCount: number;
}

export class SpeechSynthesisPipeline {
  private voiceAdapter: VoiceAdapter;
  private modelManager: PiperModelManager;
  private speaking = false;
  private stopRequested = false;

  constructor(voiceAdapter: VoiceAdapter, modelManager: PiperModelManager) {
    this.voiceAdapter = voiceAdapter;
    this.modelManager = modelManager;
  }

  /**
   * Speak text aloud: preprocess → synthesize → play.
   * Returns result indicating completion status.
   */
  async speak(text: string, options?: TTSOptions): Promise<SpeakResult> {
    // Auto-load voice if not already loaded
    if (!this.modelManager.isLoaded()) {
      this.modelManager.loadVoice();
    }

    // Preprocess text for TTS
    const processed = preprocessForTTS(text);
    const sentences = splitIntoSentences(processed);

    if (sentences.length === 0) {
      return { completed: true, totalDurationMs: 0, sentenceCount: 0 };
    }

    this.speaking = true;
    this.stopRequested = false;
    let totalDurationMs = 0;
    let sentencesProcessed = 0;

    for (const sentence of sentences) {
      if (this.stopRequested) {
        break;
      }

      // Synthesize sentence
      const audio = await this.voiceAdapter.synthesize(sentence, options);
      totalDurationMs += audio.durationMs;
      sentencesProcessed++;

      if (this.stopRequested) {
        break;
      }

      // Play audio
      await this.voiceAdapter.playAudio(audio);
    }

    const completed = !this.stopRequested;
    this.speaking = false;
    this.stopRequested = false;

    return {
      completed,
      totalDurationMs,
      sentenceCount: sentencesProcessed,
    };
  }

  /**
   * Stop current speech playback.
   */
  async stop(): Promise<void> {
    this.stopRequested = true;
    await this.voiceAdapter.stopPlayback();
    this.speaking = false;
  }

  /**
   * Check if currently speaking.
   */
  isSpeaking(): boolean {
    return this.speaking;
  }
}

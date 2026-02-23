// VoiceConversationManager — State machine for voice conversation mode.
//
// States: idle → listening → processing → speaking → idle/listening
// Does NOT take Orchestrator — returns transcription text for caller to route.
//
// CRITICAL: No network imports. All processing is local.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { VoiceAdapter, TranscriptionResult } from '../platform/voice-types.js';
import type { TranscriptionPipeline } from './transcription-pipeline.js';
import type { SpeechSynthesisPipeline } from './speech-synthesis-pipeline.js';

export type VoiceConversationState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export type StateChangeCallback = (state: VoiceConversationState) => void;
export type TranscriptionCallback = (result: TranscriptionResult) => void;

export class VoiceConversationManager {
  private transcriptionPipeline: TranscriptionPipeline;
  private synthesisPipeline: SpeechSynthesisPipeline;
  private voiceAdapter: VoiceAdapter;

  private state: VoiceConversationState = 'idle';
  private stateCallbacks: StateChangeCallback[] = [];
  private transcriptionCallbacks: TranscriptionCallback[] = [];
  private active = false;

  constructor(
    transcriptionPipeline: TranscriptionPipeline,
    synthesisPipeline: SpeechSynthesisPipeline,
    voiceAdapter: VoiceAdapter,
  ) {
    this.transcriptionPipeline = transcriptionPipeline;
    this.synthesisPipeline = synthesisPipeline;
    this.voiceAdapter = voiceAdapter;
  }

  /**
   * Activate voice conversation mode. Sets state to 'idle' (ready for listening).
   */
  activate(): void {
    this.active = true;
    this.setState('idle');
  }

  /**
   * Deactivate voice conversation mode and release resources.
   */
  async deactivate(): Promise<void> {
    if (this.state === 'listening') {
      // Cancel any active recording
      try {
        await this.voiceAdapter.stopPlayback();
      } catch {
        // Best effort
      }
    }

    if (this.state === 'speaking') {
      await this.synthesisPipeline.stop();
    }

    this.active = false;
    this.setState('idle');
  }

  /**
   * Start listening for speech. Records until stopped.
   * Returns the transcription result.
   */
  async startListening(): Promise<TranscriptionResult | null> {
    if (!this.active) return null;

    this.setState('listening');

    try {
      const session = await this.voiceAdapter.startCapture();

      // Return a promise that resolves when stopListening is called externally
      // For now, we expose this as a paired start/stop pattern
      this._currentSession = session;
      return null; // Caller will call stopListening() to complete
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  private _currentSession: { stop(): Promise<import('../platform/voice-types.js').AudioData>; cancel(): Promise<void>; isRecording(): boolean; durationMs(): number } | null = null;

  /**
   * Stop listening and process the recording.
   * Returns the transcription result.
   */
  async stopListening(): Promise<TranscriptionResult | null> {
    if (!this._currentSession) return null;

    this.setState('processing');

    try {
      const audio = await this._currentSession.stop();
      this._currentSession = null;

      const result = await this.transcriptionPipeline.transcribe(audio);

      // Notify transcription callbacks
      for (const cb of this.transcriptionCallbacks) {
        cb(result);
      }

      this.setState('idle');
      return result;
    } catch (err) {
      this._currentSession = null;
      this.setState('error');
      throw err;
    }
  }

  /**
   * Speak a response text via TTS.
   */
  async speakResponse(text: string): Promise<void> {
    if (!this.active) return;

    this.setState('speaking');

    try {
      await this.synthesisPipeline.speak(text);
      this.setState('idle');
    } catch {
      this.setState('error');
    }
  }

  /**
   * Get current conversation state.
   */
  getState(): VoiceConversationState {
    return this.state;
  }

  /**
   * Register a state change callback.
   * Returns an unsubscribe function.
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.push(callback);
    return () => {
      const idx = this.stateCallbacks.indexOf(callback);
      if (idx >= 0) this.stateCallbacks.splice(idx, 1);
    };
  }

  /**
   * Register a transcription callback (called when transcription completes).
   * Returns an unsubscribe function.
   */
  onTranscription(callback: TranscriptionCallback): () => void {
    this.transcriptionCallbacks.push(callback);
    return () => {
      const idx = this.transcriptionCallbacks.indexOf(callback);
      if (idx >= 0) this.transcriptionCallbacks.splice(idx, 1);
    };
  }

  private setState(newState: VoiceConversationState): void {
    if (this.state === newState) return;
    this.state = newState;
    for (const cb of this.stateCallbacks) {
      cb(newState);
    }
  }
}

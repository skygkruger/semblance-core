// VoiceResourceCoordinator — Coordinates model loading based on memory budget.
//
// Manages the lifecycle of Whisper and Piper models in coordination
// with the memory budget strategy.
//
// CRITICAL: No network imports. Pure local resource management.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { VoiceMemoryBudget, VoiceLoadingStrategy } from './voice-memory-budget.js';
import type { WhisperModelManager } from './whisper-model-manager.js';
import type { PiperModelManager } from './piper-model-manager.js';

export interface VoiceReadiness {
  strategy: VoiceLoadingStrategy;
  sttReady: boolean;
  ttsReady: boolean;
  whisperModel: string | null;
  piperVoice: string | null;
}

export class VoiceResourceCoordinator {
  private memoryBudget: VoiceMemoryBudget;
  private whisperManager: WhisperModelManager;
  private piperManager: PiperModelManager;

  constructor(
    memoryBudget: VoiceMemoryBudget,
    whisperManager: WhisperModelManager,
    piperManager: PiperModelManager,
  ) {
    this.memoryBudget = memoryBudget;
    this.whisperManager = whisperManager;
    this.piperManager = piperManager;
  }

  /**
   * Prepare models for voice interaction based on memory strategy.
   * Returns readiness status.
   */
  prepareForVoice(): VoiceReadiness {
    const strategy = this.memoryBudget.getLoadingStrategy();

    if (strategy === 'unavailable') {
      return {
        strategy,
        sttReady: false,
        ttsReady: false,
        whisperModel: null,
        piperVoice: null,
      };
    }

    // Load Whisper for all strategies except unavailable
    if (!this.whisperManager.isLoaded()) {
      this.whisperManager.loadModel();
    }

    const whisperModel = this.whisperManager.getLoadedModel()?.id ?? null;
    let ttsReady = false;
    let piperVoice: string | null = null;

    // Load Piper based on strategy
    if (strategy === 'both-persistent' || strategy === 'on-demand') {
      if (!this.piperManager.isLoaded()) {
        this.piperManager.loadVoice();
      }
      ttsReady = this.piperManager.isLoaded();
      piperVoice = this.piperManager.getLoadedVoice()?.id ?? null;
    }

    return {
      strategy,
      sttReady: this.whisperManager.isLoaded(),
      ttsReady,
      whisperModel,
      piperVoice,
    };
  }

  /**
   * Release all voice model resources.
   */
  releaseVoiceResources(): void {
    this.whisperManager.unloadModel();
    this.piperManager.unloadVoice();
  }

  /**
   * Handle memory pressure: immediately unload all voice models.
   */
  onMemoryPressure(): void {
    this.releaseVoiceResources();
  }
}

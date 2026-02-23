// VoiceMemoryBudget — Determines available memory for voice models.
//
// Uses static LLM RAM figure (from model catalog), not runtime memory polling.
// Simpler and more predictable than dynamic memory monitoring.
//
// CRITICAL: No network imports. Pure computation.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { HardwareProfile } from '../llm/hardware-types.js';
import { WHISPER_MODELS, type WhisperModelEntry } from './whisper-model-manager.js';
import { PIPER_VOICES, type PiperVoiceEntry } from './piper-model-manager.js';

/** OS overhead estimate in MB */
const OS_OVERHEAD_MB = 2048;

/** Embedding model overhead estimate in MB */
const EMBEDDING_OVERHEAD_MB = 300;

export type VoiceLoadingStrategy =
  | 'both-persistent'   // Enough RAM for both Whisper + Piper to stay loaded
  | 'on-demand'         // Load/unload as needed (tight memory)
  | 'stt-only'          // Only enough for STT (no TTS)
  | 'unavailable';      // Not enough memory for voice at all

export class VoiceMemoryBudget {
  private hardwareProfile: HardwareProfile;
  private llmRamMb: number;

  constructor(hardwareProfile: HardwareProfile, llmRamMb: number) {
    this.hardwareProfile = hardwareProfile;
    this.llmRamMb = llmRamMb;
  }

  /**
   * Get available memory for voice models in MB.
   * totalRAM - OS_OVERHEAD - LLM - embedding
   */
  getAvailableMemoryMB(): number {
    return Math.max(
      0,
      this.hardwareProfile.totalRamMb - OS_OVERHEAD_MB - this.llmRamMb - EMBEDDING_OVERHEAD_MB,
    );
  }

  /**
   * Check if a specific Whisper model can be loaded.
   */
  canLoadWhisper(model: WhisperModelEntry): boolean {
    return model.ramRequiredMb <= this.getAvailableMemoryMB();
  }

  /**
   * Check if both Whisper and Piper models can be loaded simultaneously.
   */
  canLoadBothModels(whisper: WhisperModelEntry, piper: PiperVoiceEntry): boolean {
    return (whisper.ramRequiredMb + piper.ramRequiredMb) <= this.getAvailableMemoryMB();
  }

  /**
   * Determine the optimal loading strategy based on available memory.
   */
  getLoadingStrategy(): VoiceLoadingStrategy {
    const availableMb = this.getAvailableMemoryMB();

    // Find smallest Whisper model
    const smallestWhisper = WHISPER_MODELS[0]!; // whisper-tiny (200 MB)
    const smallestPiper = PIPER_VOICES[0]!; // ~80 MB

    // Can't even load the smallest Whisper model
    if (availableMb < smallestWhisper.ramRequiredMb) {
      return 'unavailable';
    }

    // Can load Whisper but not both
    if (availableMb < smallestWhisper.ramRequiredMb + smallestPiper.ramRequiredMb) {
      return 'stt-only';
    }

    // Find best models for available memory
    const bestWhisper = WHISPER_MODELS
      .filter(m => m.ramRequiredMb <= availableMb * 0.7) // Leave 30% for Piper + headroom
      .sort((a, b) => b.ramRequiredMb - a.ramRequiredMb)[0];

    if (!bestWhisper) {
      return 'on-demand';
    }

    const remainingForPiper = availableMb - bestWhisper.ramRequiredMb;
    const bestPiper = PIPER_VOICES
      .filter(v => v.ramRequiredMb <= remainingForPiper)
      .sort((a, b) => b.ramRequiredMb - a.ramRequiredMb)[0];

    if (!bestPiper) {
      return 'on-demand';
    }

    // If there's at least 200MB headroom after loading both, we can persist
    const headroom = availableMb - bestWhisper.ramRequiredMb - bestPiper.ramRequiredMb;
    if (headroom >= 200) {
      return 'both-persistent';
    }

    return 'on-demand';
  }

  /**
   * Check if voice interaction is available at all.
   */
  isVoiceAvailable(): boolean {
    return this.getLoadingStrategy() !== 'unavailable';
  }
}

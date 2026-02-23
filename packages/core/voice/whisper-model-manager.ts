// WhisperModelManager — Model selection and lifecycle for Whisper.cpp STT.
//
// Handles hardware-aware model selection and in-memory model lifecycle.
// Does NOT handle download (that goes through Gateway via model.download IPC action).
//
// CRITICAL: No network imports. Pure local model management.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import type { HardwareProfile } from '../llm/hardware-types.js';

export interface WhisperModelEntry {
  id: string;
  name: string;
  sizeMb: number;
  ramRequiredMb: number;
  quality: 'basic' | 'good' | 'great' | 'excellent';
  languages: number;
  hfRepo: string;
  hfFilename: string;
}

/**
 * Catalog of Whisper GGUF models available for local STT.
 */
export const WHISPER_MODELS: WhisperModelEntry[] = [
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    sizeMb: 75,
    ramRequiredMb: 200,
    quality: 'basic',
    languages: 99,
    hfRepo: 'ggerganov/whisper.cpp',
    hfFilename: 'ggml-tiny.bin',
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base',
    sizeMb: 140,
    ramRequiredMb: 350,
    quality: 'good',
    languages: 99,
    hfRepo: 'ggerganov/whisper.cpp',
    hfFilename: 'ggml-base.bin',
  },
  {
    id: 'whisper-medium',
    name: 'Whisper Medium',
    sizeMb: 750,
    ramRequiredMb: 1500,
    quality: 'great',
    languages: 99,
    hfRepo: 'ggerganov/whisper.cpp',
    hfFilename: 'ggml-medium.bin',
  },
  {
    id: 'whisper-large-v3',
    name: 'Whisper Large V3',
    sizeMb: 1500,
    ramRequiredMb: 3000,
    quality: 'excellent',
    languages: 99,
    hfRepo: 'ggerganov/whisper.cpp',
    hfFilename: 'ggml-large-v3.bin',
  },
];

export class WhisperModelManager {
  private hardwareProfile: HardwareProfile;
  private memoryBudgetMb: number;
  private loadedModel: WhisperModelEntry | null = null;

  constructor(hardwareProfile: HardwareProfile, memoryBudgetMb?: number) {
    this.hardwareProfile = hardwareProfile;
    // Default memory budget: 50% of total RAM minus 2GB OS overhead
    this.memoryBudgetMb = memoryBudgetMb ?? Math.max(0, (hardwareProfile.totalRamMb - 2048) * 0.5);
  }

  /**
   * Select the best Whisper model for the current hardware.
   * Returns the highest quality model that fits in the memory budget.
   */
  selectModel(): WhisperModelEntry {
    const candidates = WHISPER_MODELS
      .filter(m => m.ramRequiredMb <= this.memoryBudgetMb)
      .sort((a, b) => b.ramRequiredMb - a.ramRequiredMb); // Best first

    if (candidates.length === 0) {
      // Always fall back to tiny
      return WHISPER_MODELS[0]!;
    }

    // For mobile, prefer base over larger models
    if (this.hardwareProfile.os !== 'windows' && this.hardwareProfile.os !== 'macos' && this.hardwareProfile.os !== 'linux') {
      const mobileMax = candidates.find(m => m.ramRequiredMb <= 500);
      if (mobileMax) return mobileMax;
    }

    return candidates[0]!;
  }

  /**
   * Mark a model as loaded (in-memory lifecycle tracking).
   */
  loadModel(modelId?: string): WhisperModelEntry {
    const model = modelId
      ? WHISPER_MODELS.find(m => m.id === modelId)
      : this.selectModel();

    if (!model) {
      throw new Error(`Unknown Whisper model: ${modelId}`);
    }

    this.loadedModel = model;
    return model;
  }

  /**
   * Unload the currently loaded model (free memory).
   */
  unloadModel(): void {
    this.loadedModel = null;
  }

  /**
   * Check if any model is currently loaded.
   */
  isLoaded(): boolean {
    return this.loadedModel !== null;
  }

  /**
   * Get the currently loaded model, or null.
   */
  getLoadedModel(): WhisperModelEntry | null {
    return this.loadedModel;
  }

  /**
   * Get all available model entries.
   */
  getAvailableModels(): WhisperModelEntry[] {
    return [...WHISPER_MODELS];
  }
}

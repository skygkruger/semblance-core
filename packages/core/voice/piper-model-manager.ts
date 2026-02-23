// PiperModelManager — Voice model selection and lifecycle for Piper TTS.
//
// Manages ONNX voice model catalog, selection, and in-memory lifecycle.
// Does NOT handle download (that goes through Gateway via model.download IPC action).
//
// CRITICAL: No network imports. Pure local model management.
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

export interface PiperVoiceEntry {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  quality: 'low' | 'medium' | 'high';
  sizeMb: number;
  ramRequiredMb: number;
  sampleRate: number;
  hfRepo: string;
  hfFilename: string;
}

/**
 * Catalog of Piper ONNX voices available for local TTS.
 */
export const PIPER_VOICES: PiperVoiceEntry[] = [
  {
    id: 'en_US-amy-medium',
    name: 'Amy',
    language: 'en_US',
    gender: 'female',
    quality: 'medium',
    sizeMb: 30,
    ramRequiredMb: 80,
    sampleRate: 22050,
    hfRepo: 'rhasspy/piper-voices',
    hfFilename: 'en_US-amy-medium.onnx',
  },
  {
    id: 'en_US-ryan-medium',
    name: 'Ryan',
    language: 'en_US',
    gender: 'male',
    quality: 'medium',
    sizeMb: 30,
    ramRequiredMb: 80,
    sampleRate: 22050,
    hfRepo: 'rhasspy/piper-voices',
    hfFilename: 'en_US-ryan-medium.onnx',
  },
  {
    id: 'en_GB-alba-medium',
    name: 'Alba',
    language: 'en_GB',
    gender: 'female',
    quality: 'medium',
    sizeMb: 30,
    ramRequiredMb: 80,
    sampleRate: 22050,
    hfRepo: 'rhasspy/piper-voices',
    hfFilename: 'en_GB-alba-medium.onnx',
  },
  {
    id: 'en_US-lessac-high',
    name: 'Lessac',
    language: 'en_US',
    gender: 'female',
    quality: 'high',
    sizeMb: 65,
    ramRequiredMb: 150,
    sampleRate: 22050,
    hfRepo: 'rhasspy/piper-voices',
    hfFilename: 'en_US-lessac-high.onnx',
  },
];

export class PiperModelManager {
  private loadedVoice: PiperVoiceEntry | null = null;

  /**
   * Get the default voice (first en_US medium voice).
   */
  getDefaultVoice(): PiperVoiceEntry {
    return PIPER_VOICES.find(v => v.language === 'en_US' && v.quality === 'medium')
      ?? PIPER_VOICES[0]!;
  }

  /**
   * List all available voice entries.
   */
  listVoices(): PiperVoiceEntry[] {
    return [...PIPER_VOICES];
  }

  /**
   * Mark a voice as loaded (in-memory lifecycle tracking).
   */
  loadVoice(voiceId?: string): PiperVoiceEntry {
    const voice = voiceId
      ? PIPER_VOICES.find(v => v.id === voiceId)
      : this.getDefaultVoice();

    if (!voice) {
      throw new Error(`Unknown Piper voice: ${voiceId}`);
    }

    this.loadedVoice = voice;
    return voice;
  }

  /**
   * Unload the currently loaded voice (free memory).
   */
  unloadVoice(): void {
    this.loadedVoice = null;
  }

  /**
   * Check if any voice is currently loaded.
   */
  isLoaded(): boolean {
    return this.loadedVoice !== null;
  }

  /**
   * Get the currently loaded voice, or null.
   */
  getLoadedVoice(): PiperVoiceEntry | null {
    return this.loadedVoice;
  }
}

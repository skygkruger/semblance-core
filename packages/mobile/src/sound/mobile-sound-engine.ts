// MobileSoundEngine — React Native implementation of SoundEngine.
//
// Uses react-native-sound to play bundled WAV assets. Respects iOS silent switch
// (playsInSilentModeIOS = false). Same silent-failure pattern as desktop engine.

import type { SoundId, SoundCategory, SoundSettings, SoundEngine } from '@semblance/core/sound/sound-types';
import { SOUND_REGISTRY } from '@semblance/core/sound/sound-types';
import Sound from 'react-native-sound';

// Enable playback in the default category (respects silent switch)
Sound.setCategory('Ambient');

export class MobileSoundEngine implements SoundEngine {
  private sounds: Map<SoundId, Sound> = new Map();
  private settings: SoundSettings = {
    enabled: true,
    categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
  };
  private ready = false;

  async initialize(settings: SoundSettings): Promise<void> {
    this.settings = { ...settings };
    await this.preload();
    this.ready = true;
  }

  async preload(): Promise<void> {
    const allSoundIds = Object.keys(SOUND_REGISTRY) as SoundId[];

    const results = await Promise.allSettled(
      allSoundIds.map(
        (id) =>
          new Promise<void>((resolve, reject) => {
            const config = SOUND_REGISTRY[id];
            const sound = new Sound(config.filename, Sound.MAIN_BUNDLE, (error) => {
              if (error) {
                console.warn(`[MobileSoundEngine] Failed to preload ${id}: ${error.message}`);
                reject(error);
                return;
              }
              this.sounds.set(id, sound);
              resolve();
            });
          }),
      ),
    );

    // Log but don't fail on partial preload
    const failures = results.filter((r) => r.status === 'rejected').length;
    if (failures > 0) {
      console.warn(`[MobileSoundEngine] ${failures}/${allSoundIds.length} sounds failed to preload`);
    }
  }

  play(id: SoundId): void {
    if (!this.settings.enabled || !this.ready) return;

    const sound = this.sounds.get(id);
    if (!sound) return;

    const config = SOUND_REGISTRY[id];
    if (!config) return;

    try {
      const categoryVolume = this.settings.categoryVolumes[config.category] ?? 1.0;
      sound.setVolume(config.defaultVolume * categoryVolume);
      sound.stop(() => {
        sound.play((success) => {
          if (!success) {
            console.warn(`[MobileSoundEngine] Playback failed for ${id}`);
          }
        });
      });
    } catch {
      // Silent failure — never throw from play()
    }
  }

  playOnce(id: SoundId): void {
    this.play(id);
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  isReady(): boolean {
    return this.ready;
  }

  getSettings(): SoundSettings {
    return { ...this.settings };
  }

  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
  }

  setCategoryVolume(category: SoundCategory, volume: number): void {
    this.settings.categoryVolumes[category] = Math.max(0, Math.min(1, volume));
  }

  updateSettings(settings: SoundSettings): void {
    this.settings = { ...settings };
  }
}

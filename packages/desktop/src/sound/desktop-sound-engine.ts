// DesktopSoundEngine — Web Audio API implementation of SoundEngine.
//
// Preloads all 10 WAV files as AudioBuffers. Plays via BufferSource → GainNode → destination.
// Handles user gesture requirement for AudioContext resume. Never throws on play().

import type { SoundId, SoundCategory, SoundSettings, SoundEngine } from '@semblance/core/sound/sound-types';
import { SOUND_REGISTRY } from '@semblance/core/sound/sound-types';

// Static imports of all sound files — Vite resolves these to asset URLs
import messageSentUrl from '../assets/sounds/message-sent.wav?url';
import actionRequestUrl from '../assets/sounds/action-request.wav?url';
import approvedUrl from '../assets/sounds/approved.wav?url';
import rejectedUrl from '../assets/sounds/rejected.wav?url';
import hardLimitTriggeredUrl from '../assets/sounds/hard-limit-triggered.wav?url';
import initializeUrl from '../assets/sounds/initialize.wav?url';
import morningBriefUrl from '../assets/sounds/morning-brief.wav?url';
import notificationUrl from '../assets/sounds/notification.wav?url';
import voiceStartUrl from '../assets/sounds/voice-start.wav?url';
import voiceStopUrl from '../assets/sounds/voice-stop.wav?url';

const SOUND_URLS: Record<SoundId, string> = {
  message_sent: messageSentUrl,
  alter_ego_batched: actionRequestUrl,
  action_approved: approvedUrl,
  action_rejected: rejectedUrl,
  hard_limit_triggered: hardLimitTriggeredUrl,
  initialize: initializeUrl,
  morning_brief_ready: morningBriefUrl,
  notification: notificationUrl,
  voice_start: voiceStartUrl,
  voice_stop: voiceStopUrl,
};

export class DesktopSoundEngine implements SoundEngine {
  private ctx: AudioContext | null = null;
  private buffers: Map<SoundId, AudioBuffer> = new Map();
  private settings: SoundSettings = {
    enabled: true,
    categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
  };
  private ready = false;
  private gestureHandled = false;

  async initialize(settings: SoundSettings): Promise<void> {
    this.settings = { ...settings };
    this.ctx = new AudioContext();

    // AudioContext may be suspended until user gesture
    if (this.ctx.state === 'suspended') {
      this.attachGestureListeners();
    }

    await this.preload();
    this.ready = true;
  }

  async preload(): Promise<void> {
    if (!this.ctx) return;

    const entries = Object.entries(SOUND_URLS) as [SoundId, string][];
    const results = await Promise.allSettled(
      entries.map(async ([id, url]) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
        this.buffers.set(id, audioBuffer);
      }),
    );

    // Log failures but don't throw — partial preload is acceptable
    for (let i = 0; i < results.length; i++) {
      const r = results[i]!;
      if (r.status === 'rejected') {
        console.warn(`[SoundEngine] Failed to preload ${entries[i]![0]}: ${r.reason}`);
      }
    }
  }

  play(id: SoundId): void {
    if (!this.settings.enabled || !this.ready || !this.ctx) return;

    const buffer = this.buffers.get(id);
    if (!buffer) return;

    const config = SOUND_REGISTRY[id];
    if (!config) return;

    // Resume context if suspended (user gesture may have unlocked it)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    try {
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();

      source.buffer = buffer;
      const categoryVolume = this.settings.categoryVolumes[config.category] ?? 1.0;
      gain.gain.value = config.defaultVolume * categoryVolume;

      source.connect(gain);
      gain.connect(this.ctx.destination);
      source.start(0);
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

  // ─── Private ─────────────────────────────────────────────────────────────

  private attachGestureListeners(): void {
    if (this.gestureHandled) return;

    const resume = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.gestureHandled = true;
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };

    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });
  }
}

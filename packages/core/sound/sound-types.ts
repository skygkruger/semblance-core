// Sound Effects System — Type definitions, registry, and engine interface.
//
// Pure types, no network imports. Safe for packages/core/.
// 10 sounds: 8 from WAV files, 2 generated programmatically.

// ─── Sound Identifiers ───────────────────────────────────────────────────────

export type SoundId =
  | 'message_sent'
  | 'alter_ego_batched'
  | 'action_approved'
  | 'action_rejected'
  | 'hard_limit_triggered'
  | 'initialize'
  | 'morning_brief_ready'
  | 'notification'
  | 'voice_start'
  | 'voice_stop';

export type SoundCategory = 'actions' | 'system' | 'voice';

// ─── Configuration ───────────────────────────────────────────────────────────

export interface SoundConfig {
  id: SoundId;
  category: SoundCategory;
  filename: string;
  defaultVolume: number;
  description: string;
}

export interface SoundSettings {
  enabled: boolean;
  categoryVolumes: Record<SoundCategory, number>;
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const SOUND_REGISTRY: Record<SoundId, SoundConfig> = {
  message_sent: {
    id: 'message_sent',
    category: 'actions',
    filename: 'message-sent.wav',
    defaultVolume: 0.6,
    description: 'Played when user sends a chat message',
  },
  alter_ego_batched: {
    id: 'alter_ego_batched',
    category: 'actions',
    filename: 'action-request.wav',
    defaultVolume: 0.7,
    description: 'Played when Alter Ego queues a batch of actions for review',
  },
  action_approved: {
    id: 'action_approved',
    category: 'actions',
    filename: 'approved.wav',
    defaultVolume: 0.7,
    description: 'Played when user approves one or more batched actions',
  },
  action_rejected: {
    id: 'action_rejected',
    category: 'actions',
    filename: 'rejected.wav',
    defaultVolume: 0.7,
    description: 'Played when user rejects one or more batched actions',
  },
  hard_limit_triggered: {
    id: 'hard_limit_triggered',
    category: 'system',
    filename: 'hard-limit-triggered.wav',
    defaultVolume: 0.8,
    description: 'Played when a hard limit blocks an action',
  },
  initialize: {
    id: 'initialize',
    category: 'system',
    filename: 'initialize.wav',
    defaultVolume: 0.5,
    description: 'Played on first launch after onboarding completes',
  },
  morning_brief_ready: {
    id: 'morning_brief_ready',
    category: 'system',
    filename: 'morning-brief.wav',
    defaultVolume: 0.6,
    description: 'Played when the morning brief is ready',
  },
  notification: {
    id: 'notification',
    category: 'system',
    filename: 'notification.wav',
    defaultVolume: 0.6,
    description: 'Played for proactive notifications',
  },
  voice_start: {
    id: 'voice_start',
    category: 'voice',
    filename: 'voice-start.wav',
    defaultVolume: 0.5,
    description: 'Played when voice recording starts',
  },
  voice_stop: {
    id: 'voice_stop',
    category: 'voice',
    filename: 'voice-stop.wav',
    defaultVolume: 0.5,
    description: 'Played when voice recording stops and transcription begins',
  },
};

export const SOUND_CATEGORY_LABELS: Record<SoundCategory, string> = {
  actions: 'Actions',
  system: 'System',
  voice: 'Voice',
};

// ─── Engine Interface ────────────────────────────────────────────────────────

export interface SoundEngine {
  initialize(settings: SoundSettings): Promise<void>;
  preload(): Promise<void>;
  play(id: SoundId): void;
  playOnce(id: SoundId): void;
  isEnabled(): boolean;
  isReady(): boolean;
  getSettings(): SoundSettings;
  setEnabled(enabled: boolean): void;
  setCategoryVolume(category: SoundCategory, volume: number): void;
  updateSettings(settings: SoundSettings): void;
}

// Storybook mock for @semblance/core/sound/sound-types

export type SoundCategory = 'actions' | 'system' | 'voice';
export type SoundId = string;

export const SOUND_CATEGORY_LABELS: Record<SoundCategory, string> = {
  actions: 'Actions',
  system: 'System',
  voice: 'Voice',
};

// SoundSettingsSection — Settings section for sound effects.
// Toggle: sound effects (default ON), 3 category volume sliders with preview buttons.
// Pattern: VoiceSettingsSection.tsx.

import { Card } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useSound } from '../sound/SoundEngineContext';
import { saveSoundSettings } from '../ipc/commands';
import { SOUND_CATEGORY_LABELS } from '@semblance/core/sound/sound-types';
import type { SoundId, SoundCategory } from '@semblance/core/sound/sound-types';

const CATEGORY_PREVIEW_SOUNDS: Record<SoundCategory, SoundId> = {
  actions: 'message_sent',
  system: 'notification',
  voice: 'voice_start',
};

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
          {label}
        </p>
        {description && (
          <p className="text-xs text-semblance-text-tertiary mt-1">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked
            ? 'bg-semblance-primary'
            : 'bg-semblance-border dark:bg-semblance-border-dark'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

export function SoundSettingsSection() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { play } = useSound();

  const settings = state.soundSettings ?? {
    enabled: true,
    categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
  };

  const updateAndPersist = (partial: Partial<typeof settings>) => {
    const updated = { ...settings, ...partial };
    dispatch({ type: 'SET_SOUND_SETTINGS', settings: updated });
    saveSoundSettings(updated).catch(() => {});
  };

  const handleVolumeChange = (category: SoundCategory, value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    updateAndPersist({
      categoryVolumes: { ...settings.categoryVolumes, [category]: clamped },
    });
  };

  return (
    <Card>
      <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
        Sound Effects
      </h2>

      <div className="space-y-4">
        {/* Main toggle */}
        <Toggle
          checked={settings.enabled}
          onChange={() => updateAndPersist({ enabled: !settings.enabled })}
          label="Sound effects"
          description="Play sounds for actions, system events, and voice interactions. All sounds are bundled locally."
        />

        {/* Category volume sliders (only visible when enabled) */}
        {settings.enabled && (
          <div className="pl-4 space-y-4 border-l-2 border-semblance-border dark:border-semblance-border-dark">
            {(Object.keys(SOUND_CATEGORY_LABELS) as SoundCategory[]).map((category) => (
              <div key={category}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider">
                    {SOUND_CATEGORY_LABELS[category]}
                  </label>
                  <button
                    type="button"
                    onClick={() => play(CATEGORY_PREVIEW_SOUNDS[category])}
                    className="p-1 rounded text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:text-semblance-primary transition-colors"
                    aria-label={`Preview ${SOUND_CATEGORY_LABELS[category]} sound`}
                  >
                    <PlayIcon />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((settings.categoryVolumes[category] ?? 1) * 100)}
                    onChange={(e) => handleVolumeChange(category, parseInt(e.target.value, 10) / 100)}
                    className="flex-1 h-1.5 rounded-full appearance-none bg-semblance-border dark:bg-semblance-border-dark accent-semblance-primary"
                  />
                  <span className="text-xs text-semblance-text-tertiary w-8 text-right tabular-nums">
                    {Math.round((settings.categoryVolumes[category] ?? 1) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

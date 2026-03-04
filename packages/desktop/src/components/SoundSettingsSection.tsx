// SoundSettingsSection — Settings section for sound effects.
// Toggle: sound effects (default ON), 3 category volume sliders with preview buttons.

import { useAppState, useAppDispatch } from '../state/AppState';
import { useSound } from '../sound/SoundEngineContext';
import { saveSoundSettings } from '../ipc/commands';
import { SOUND_CATEGORY_LABELS } from '@semblance/core/sound/sound-types';
import type { SoundId, SoundCategory } from '@semblance/core/sound/sound-types';
import { Toggle } from './Toggle';
import './SettingsSection.css';

const CATEGORY_PREVIEW_SOUNDS: Record<SoundCategory, SoundId> = {
  actions: 'message_sent',
  system: 'notification',
  voice: 'voice_start',
};

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
    <div>
      <h2 className="settings-section__title">Sound Effects</h2>

      <div className="settings-section__group">
        <Toggle
          checked={settings.enabled}
          onChange={() => updateAndPersist({ enabled: !settings.enabled })}
          label="Sound effects"
          description="Play sounds for actions, system events, and voice interactions. All sounds are bundled locally."
        />

        {settings.enabled && (
          <div className="settings-section__subgroup">
            {(Object.keys(SOUND_CATEGORY_LABELS) as SoundCategory[]).map((category) => (
              <div key={category}>
                <div className="settings-section__action-row">
                  <span className="settings-section__label" style={{ marginBottom: 0 }}>
                    {SOUND_CATEGORY_LABELS[category]}
                  </span>
                  <button
                    type="button"
                    onClick={() => play(CATEGORY_PREVIEW_SOUNDS[category])}
                    className="settings-section__preview-btn"
                    aria-label={`Preview ${SOUND_CATEGORY_LABELS[category]} sound`}
                  >
                    <PlayIcon />
                  </button>
                </div>
                <div className="settings-section__slider-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((settings.categoryVolumes[category] ?? 1) * 100)}
                    onChange={(e) => handleVolumeChange(category, parseInt(e.target.value, 10) / 100)}
                    className="settings-section__slider"
                  />
                  <span className="settings-section__slider-value">
                    {Math.round((settings.categoryVolumes[category] ?? 1) * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

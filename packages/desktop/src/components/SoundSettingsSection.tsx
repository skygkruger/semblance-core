// SoundSettingsSection — Settings section for sound effects.
// Uses Settings.css classes from semblance-ui for visual parity.

import { useAppState, useAppDispatch } from '../state/AppState';
import { useSound } from '../sound/SoundEngineContext';
import { saveSoundSettings } from '../ipc/commands';
import { SOUND_CATEGORY_LABELS } from '@semblance/core/sound/sound-types';
import type { SoundId, SoundCategory } from '@semblance/core/sound/sound-types';
import '@semblance/ui/components/Settings/Settings.css';

const CATEGORY_PREVIEW_SOUNDS: Record<SoundCategory, SoundId> = {
  actions: 'message_sent',
  system: 'notification',
  voice: 'voice_start',
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="settings-toggle" data-on={String(on)} onClick={onToggle}>
      <span className="settings-toggle__thumb" />
    </button>
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
    <div className="settings-content">
      <div className="settings-section-header">Sound Effects</div>

      <div className="settings-row" onClick={() => updateAndPersist({ enabled: !settings.enabled })}>
        <span className="settings-row__label">Sound effects</span>
        <Toggle on={settings.enabled} onToggle={() => updateAndPersist({ enabled: !settings.enabled })} />
      </div>

      <p className="settings-explanation">
        Play sounds for actions, system events, and voice interactions. All sounds are bundled locally.
      </p>

      {settings.enabled && (
        <>
          <div className="settings-section-header">Category Volumes</div>
          {(Object.keys(SOUND_CATEGORY_LABELS) as SoundCategory[]).map((category) => {
            const vol = Math.round((settings.categoryVolumes[category] ?? 1) * 100);
            return (
              <div key={category} className="settings-row settings-row--static" style={{ flexWrap: 'wrap' }}>
                <span className="settings-row__label">{SOUND_CATEGORY_LABELS[category]}</span>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#A8B4C0', cursor: 'pointer', padding: 4, transition: 'color 180ms' }}
                  onClick={() => play(CATEGORY_PREVIEW_SOUNDS[category])}
                  aria-label={`Preview ${SOUND_CATEGORY_LABELS[category]} sound`}
                >
                  <PlayIcon />
                </button>
                <span className="settings-row__value">{vol}%</span>
                <div style={{ width: '100%', padding: '4px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={vol}
                    onChange={(e) => handleVolumeChange(category, parseInt(e.target.value, 10) / 100)}
                    style={{ flex: 1, height: 6, accentColor: '#6ECFA3' }}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// VoiceSettingsSection — Settings section for voice interaction.
// Toggle: voice (default OFF), model selection, voice selection,
// speed slider, download button, storage indicator.

import { Button } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { Toggle } from './Toggle';
import './SettingsSection.css';

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1.0x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2.0x' },
];

const SENSITIVITY_OPTIONS = [
  { value: 'low' as const, label: 'Low' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'high' as const, label: 'High' },
];

export function VoiceSettingsSection() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const settings = state.voiceSettings ?? {
    enabled: false,
    whisperModel: null,
    piperVoice: null,
    speed: 1.0,
    silenceSensitivity: 'medium' as const,
  };

  const updateSettings = (partial: Partial<typeof settings>) => {
    dispatch({
      type: 'SET_VOICE_SETTINGS',
      settings: { ...settings, ...partial },
    });
  };

  return (
    <div>
      <h2 className="settings-section__title">Voice Interaction</h2>

      <div className="settings-section__group">
        <Toggle
          checked={settings.enabled}
          onChange={() => updateSettings({ enabled: !settings.enabled })}
          label="Voice mode"
          description="When enabled, Semblance can listen and speak using local Whisper.cpp (STT) and Piper (TTS). All audio stays on your device and is never saved to disk."
        />

        {settings.enabled && (
          <div className="settings-section__subgroup">
            {/* STT Model */}
            <div>
              <span className="settings-section__label">Speech Recognition Model</span>
              <div className="settings-section__row">
                <span className="settings-section__value">
                  {settings.whisperModel ?? 'Not downloaded'}
                </span>
                {!settings.whisperModel && (
                  <Button variant="ghost" size="sm" onClick={() => {}}>
                    Download
                  </Button>
                )}
              </div>
            </div>

            {/* TTS Voice */}
            <div>
              <span className="settings-section__label">Voice</span>
              <div className="settings-section__row">
                <span className="settings-section__value">
                  {settings.piperVoice ?? 'Not downloaded'}
                </span>
                {!settings.piperVoice && (
                  <Button variant="ghost" size="sm" onClick={() => {}}>
                    Download
                  </Button>
                )}
              </div>
            </div>

            {/* Speed */}
            <div>
              <span className="settings-section__label">Speech Speed</span>
              <select
                value={settings.speed}
                onChange={(e) => updateSettings({ speed: parseFloat(e.target.value) })}
                className="settings-section__select"
              >
                {SPEED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Silence Sensitivity */}
            <div>
              <span className="settings-section__label">Silence Sensitivity</span>
              <div className="settings-section__option-btns">
                {SENSITIVITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings({ silenceSensitivity: opt.value })}
                    className={`settings-section__option-btn${
                      settings.silenceSensitivity === opt.value ? ' settings-section__option-btn--active' : ''
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="settings-section__hint">
                Higher sensitivity detects silence sooner. Lower sensitivity waits longer before ending recording.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

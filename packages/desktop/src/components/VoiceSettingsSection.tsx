// VoiceSettingsSection — Settings section for voice interaction.
// Uses Settings.css classes from semblance-ui for visual parity.

import { useAppState, useAppDispatch } from '../state/AppState';
import '@semblance/ui/components/Settings/Settings.css';

const SPEED_OPTIONS = ['0.5x', '0.75x', '1.0x', '1.25x', '1.5x', '2.0x'];
const SPEED_VALUES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

const SENSITIVITY_OPTIONS = [
  { value: 'low' as const, label: 'Low' },
  { value: 'medium' as const, label: 'Medium' },
  { value: 'high' as const, label: 'High' },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="settings-toggle" data-on={String(on)} onClick={onToggle}>
      <span className="settings-toggle__thumb" />
    </button>
  );
}

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
    <div className="settings-content">
      <div className="settings-section-header">Voice Interaction</div>

      <div className="settings-row" onClick={() => updateSettings({ enabled: !settings.enabled })}>
        <span className="settings-row__label">Voice mode</span>
        <Toggle on={settings.enabled} onToggle={() => updateSettings({ enabled: !settings.enabled })} />
      </div>

      <p className="settings-explanation">
        When enabled, Semblance can listen and speak using local Whisper.cpp (STT) and Piper (TTS). All audio stays on your device and is never saved to disk.
      </p>

      {settings.enabled && (
        <>
          <div className="settings-section-header">Models</div>

          <div className="settings-row settings-row--static">
            <span className="settings-row__label">Speech Recognition</span>
            <span className="settings-row__value">
              {settings.whisperModel ?? 'Not downloaded'}
            </span>
            {!settings.whisperModel && (
              <button type="button" className="settings-ghost-button" style={{ fontSize: 13, padding: '4px 12px' }} onClick={() => {}}>
                Download
              </button>
            )}
          </div>

          <div className="settings-row settings-row--static">
            <span className="settings-row__label">Voice</span>
            <span className="settings-row__value">
              {settings.piperVoice ?? 'Not downloaded'}
            </span>
            {!settings.piperVoice && (
              <button type="button" className="settings-ghost-button" style={{ fontSize: 13, padding: '4px 12px' }} onClick={() => {}}>
                Download
              </button>
            )}
          </div>

          <div className="settings-section-header">Performance</div>

          <div style={{ padding: '12px 20px' }}>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>Speech Speed</div>
            <div className="settings-segment">
              {SPEED_OPTIONS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className={`settings-segment__option ${settings.speed === SPEED_VALUES[i] ? 'settings-segment__option--active' : ''}`}
                  onClick={() => updateSettings({ speed: SPEED_VALUES[i] })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '12px 20px' }}>
            <div style={{ fontSize: 13, color: '#A8B4C0', marginBottom: 8 }}>Silence Sensitivity</div>
            <div className="settings-segment">
              {SENSITIVITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`settings-segment__option ${settings.silenceSensitivity === opt.value ? 'settings-segment__option--active' : ''}`}
                  onClick={() => updateSettings({ silenceSensitivity: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="settings-explanation--small" style={{ padding: '8px 0 0', fontSize: 12, color: '#5E6B7C' }}>
              Higher sensitivity detects silence sooner. Lower sensitivity waits longer before ending recording.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

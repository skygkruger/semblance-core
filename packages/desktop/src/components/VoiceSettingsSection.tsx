// VoiceSettingsSection — Settings section for voice interaction.
// Toggle: voice (default OFF), model selection, voice selection,
// speed slider, download button, storage indicator.
// Pattern: LocationSettingsSection.tsx.

import { Card, Button } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';

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
    <Card>
      <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
        Voice Interaction
      </h2>

      <div className="space-y-4">
        {/* Main toggle */}
        <Toggle
          checked={settings.enabled}
          onChange={() => updateSettings({ enabled: !settings.enabled })}
          label="Voice mode"
          description="When enabled, Semblance can listen and speak using local Whisper.cpp (STT) and Piper (TTS). All audio stays on your device and is never saved to disk."
        />

        {/* Settings (only visible when enabled) */}
        {settings.enabled && (
          <div className="pl-4 space-y-4 border-l-2 border-semblance-border dark:border-semblance-border-dark">
            {/* STT Model */}
            <div>
              <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
                Speech Recognition Model
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  {settings.whisperModel ?? 'Not downloaded'}
                </span>
                {!settings.whisperModel && (
                  <Button variant="secondary" size="sm" onClick={() => {}}>
                    Download
                  </Button>
                )}
              </div>
            </div>

            {/* TTS Voice */}
            <div>
              <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
                Voice
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  {settings.piperVoice ?? 'Not downloaded'}
                </span>
                {!settings.piperVoice && (
                  <Button variant="secondary" size="sm" onClick={() => {}}>
                    Download
                  </Button>
                )}
              </div>
            </div>

            {/* Speed */}
            <div>
              <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
                Speech Speed
              </label>
              <select
                value={settings.speed}
                onChange={(e) => updateSettings({ speed: parseFloat(e.target.value) })}
                className="w-full px-4 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
              >
                {SPEED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Silence Sensitivity */}
            <div>
              <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
                Silence Sensitivity
              </label>
              <div className="flex gap-2">
                {SENSITIVITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateSettings({ silenceSensitivity: opt.value })}
                    className={`px-4 py-2 text-sm rounded-md border transition-colors duration-fast ${
                      settings.silenceSensitivity === opt.value
                        ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary font-medium'
                        : 'border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:border-semblance-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-semblance-text-tertiary mt-1">
                Higher sensitivity detects silence sooner. Lower sensitivity waits longer before ending recording.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

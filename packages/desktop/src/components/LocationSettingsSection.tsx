// LocationSettingsSection — Settings section for location services.
// Toggle: location services (default OFF), permission indicator, sub-toggles,
// default city input, clear history button, retention dropdown.

import { Button, Input } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { Toggle } from './Toggle';
import './SettingsSection.css';

const RETENTION_OPTIONS = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

export function LocationSettingsSection() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const settings = state.locationSettings ?? {
    enabled: false,
    remindersEnabled: false,
    commuteEnabled: false,
    weatherEnabled: false,
    defaultCity: '',
    retentionDays: 7,
  };

  const updateSettings = (partial: Partial<typeof settings>) => {
    dispatch({
      type: 'SET_LOCATION_SETTINGS',
      settings: { ...settings, ...partial },
    });
  };

  return (
    <div>
      <h2 className="settings-section__title">Location Services</h2>

      <div className="settings-section__group">
        <Toggle
          checked={settings.enabled}
          onChange={() => updateSettings({ enabled: !settings.enabled })}
          label="Location services"
          description="When enabled, Semblance uses your device location for reminders, commute alerts, and weather. All location data stays on your device."
        />

        {settings.enabled && (
          <div className="settings-section__subgroup">
            <Toggle
              checked={settings.remindersEnabled}
              onChange={() => updateSettings({ remindersEnabled: !settings.remindersEnabled })}
              label="Location reminders"
              description="Trigger reminders when you arrive at specific places."
            />

            <Toggle
              checked={settings.commuteEnabled}
              onChange={() => updateSettings({ commuteEnabled: !settings.commuteEnabled })}
              label="Commute alerts"
              description="Get departure time suggestions for upcoming events with physical locations."
            />

            <Toggle
              checked={settings.weatherEnabled}
              onChange={() => updateSettings({ weatherEnabled: !settings.weatherEnabled })}
              label="Weather awareness"
              description="Include weather context in daily briefs and event insights."
            />

            <div>
              <span className="settings-section__label">Default City (when location unavailable)</span>
              <Input
                value={settings.defaultCity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ defaultCity: e.target.value })}
                placeholder="e.g., Portland, OR"
              />
            </div>

            <div>
              <span className="settings-section__label">Location History Retention</span>
              <select
                value={settings.retentionDays}
                onChange={(e) => updateSettings({ retentionDays: parseInt(e.target.value, 10) })}
                className="settings-section__select"
              >
                {RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  dispatch({ type: 'CLEAR_LOCATION_HISTORY' });
                }}
              >
                Clear location history
              </Button>
              <p className="settings-section__hint">
                Permanently removes all stored location history from this device.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// LocationSettingsSection — Settings section for location services.
// Toggle: location services (default OFF), permission indicator, sub-toggles,
// default city input, clear history button, retention dropdown.

import { Card, Button, Input } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';

const RETENTION_OPTIONS = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
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
    <Card>
      <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
        Location Services
      </h2>

      <div className="space-y-4">
        {/* Main toggle */}
        <Toggle
          checked={settings.enabled}
          onChange={() => updateSettings({ enabled: !settings.enabled })}
          label="Location services"
          description="When enabled, Semblance uses your device location for reminders, commute alerts, and weather. All location data stays on your device."
        />

        {/* Sub-toggles (only visible when enabled) */}
        {settings.enabled && (
          <div className="pl-4 space-y-3 border-l-2 border-semblance-border dark:border-semblance-border-dark">
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

            {/* Default city */}
            <div>
              <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
                Default City (when location unavailable)
              </label>
              <Input
                value={settings.defaultCity}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSettings({ defaultCity: e.target.value })}
                placeholder="e.g., Portland, OR"
              />
            </div>

            {/* Retention */}
            <div>
              <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
                Location History Retention
              </label>
              <select
                value={settings.retentionDays}
                onChange={(e) => updateSettings({ retentionDays: parseInt(e.target.value, 10) })}
                className="w-full px-4 py-2 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
              >
                {RETENTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Clear history */}
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Dispatch clear action — handler will call locationStore.clearAllLocations()
                  dispatch({ type: 'CLEAR_LOCATION_HISTORY' });
                }}
              >
                Clear location history
              </Button>
              <p className="text-xs text-semblance-text-tertiary mt-1">
                Permanently removes all stored location history from this device.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

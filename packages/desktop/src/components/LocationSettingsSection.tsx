// LocationSettingsSection — Settings section for location services.
// Uses Settings.css classes from semblance-ui for visual parity.

import { useAppState, useAppDispatch } from '../state/AppState';
import '@semblance/ui/components/Settings/Settings.css';

const RETENTION_OPTIONS = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="settings-toggle" data-on={String(on)} onClick={onToggle}>
      <span className="settings-toggle__thumb" />
    </button>
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
    <div className="settings-content">
      <div className="settings-section-header">Location Services</div>

      <div className="settings-row" onClick={() => updateSettings({ enabled: !settings.enabled })}>
        <span className="settings-row__label">Location services</span>
        <Toggle on={settings.enabled} onToggle={() => updateSettings({ enabled: !settings.enabled })} />
      </div>

      <p className="settings-explanation">
        When enabled, Semblance uses your device location for reminders, commute alerts, and weather. All location data stays on your device.
      </p>

      {settings.enabled && (
        <>
          <div className="settings-section-header">Features</div>

          <div className="settings-row" onClick={() => updateSettings({ remindersEnabled: !settings.remindersEnabled })}>
            <span className="settings-row__label">Location reminders</span>
            <Toggle on={settings.remindersEnabled} onToggle={() => updateSettings({ remindersEnabled: !settings.remindersEnabled })} />
          </div>
          <p className="settings-explanation--small" style={{ padding: '0 20px 8px', fontSize: 12, color: '#5E6B7C' }}>
            Trigger reminders when you arrive at specific places.
          </p>

          <div className="settings-row" onClick={() => updateSettings({ commuteEnabled: !settings.commuteEnabled })}>
            <span className="settings-row__label">Commute alerts</span>
            <Toggle on={settings.commuteEnabled} onToggle={() => updateSettings({ commuteEnabled: !settings.commuteEnabled })} />
          </div>
          <p className="settings-explanation--small" style={{ padding: '0 20px 8px', fontSize: 12, color: '#5E6B7C' }}>
            Get departure time suggestions for upcoming events with physical locations.
          </p>

          <div className="settings-row" onClick={() => updateSettings({ weatherEnabled: !settings.weatherEnabled })}>
            <span className="settings-row__label">Weather awareness</span>
            <Toggle on={settings.weatherEnabled} onToggle={() => updateSettings({ weatherEnabled: !settings.weatherEnabled })} />
          </div>
          <p className="settings-explanation--small" style={{ padding: '0 20px 8px', fontSize: 12, color: '#5E6B7C' }}>
            Include weather context in daily briefs and event insights.
          </p>

          <div className="settings-section-header">Data</div>

          <div className="settings-row settings-row--static">
            <span className="settings-row__label">Default City</span>
            <div style={{ flex: 0 }}>
              <input
                type="text"
                className="settings-inline-edit__input"
                value={settings.defaultCity}
                onChange={(e) => updateSettings({ defaultCity: e.target.value })}
                placeholder="e.g., Portland, OR"
                style={{ width: 180 }}
              />
            </div>
          </div>

          <div className="settings-row settings-row--static">
            <span className="settings-row__label">History Retention</span>
            <div className="settings-segment" style={{ width: 'auto' }}>
              {RETENTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`settings-segment__option ${settings.retentionDays === opt.value ? 'settings-segment__option--active' : ''}`}
                  onClick={() => updateSettings({ retentionDays: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '12px 20px 0' }}>
            <button
              type="button"
              className="settings-ghost-button"
              style={{ color: '#C97B6E', borderColor: 'rgba(201,123,110,0.3)' }}
              onClick={() => dispatch({ type: 'CLEAR_LOCATION_HISTORY' })}
            >
              Clear location history
            </button>
            <p className="settings-explanation--small" style={{ padding: '8px 0 0', fontSize: 12, color: '#5E6B7C' }}>
              Permanently removes all stored location history from this device.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

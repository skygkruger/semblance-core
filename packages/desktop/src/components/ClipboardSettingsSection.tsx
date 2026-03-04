// ClipboardSettingsSection — Settings section for clipboard monitoring.
// Toggle: "Clipboard monitoring" (default OFF), description text, last 5 actions.

import { useAppState, useAppDispatch } from '../state/AppState';
import { Toggle } from './Toggle';
import './SettingsSection.css';

export function ClipboardSettingsSection() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const monitoringEnabled = state.clipboardSettings?.monitoringEnabled ?? false;
  const recentActions = state.clipboardSettings?.recentActions ?? [];

  const handleToggle = () => {
    dispatch({
      type: 'SET_CLIPBOARD_MONITORING',
      enabled: !monitoringEnabled,
    });
  };

  return (
    <div>
      <h2 className="settings-section__title">Clipboard Intelligence</h2>

      <div className="settings-section__group">
        <Toggle
          checked={monitoringEnabled}
          onChange={handleToggle}
          label="Clipboard monitoring"
          description="When enabled, Semblance watches your clipboard for actionable content like tracking numbers, flight codes, and URLs. All processing happens locally on your device."
        />

        {recentActions.length > 0 && (
          <div>
            <span className="settings-section__label">Recent clipboard actions</span>
            <div className="settings-section__list">
              {recentActions.slice(0, 5).map((action, i) => (
                <div key={i} className="settings-section__list-item">
                  <span>{action.patternType}: {action.action}</span>
                  <span className="settings-section__list-time">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ClipboardSettingsSection — Settings section for clipboard monitoring.
// Toggle: "Clipboard monitoring" (default OFF), description text, last 5 actions.

import { Card, Button } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';

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
    <Card>
      <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
        Clipboard Intelligence
      </h2>

      <div className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
              Clipboard monitoring
            </p>
            <p className="text-xs text-semblance-text-tertiary mt-1">
              When enabled, Semblance watches your clipboard for actionable content like tracking numbers,
              flight codes, and URLs. All processing happens locally on your device.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={monitoringEnabled}
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              monitoringEnabled
                ? 'bg-semblance-primary'
                : 'bg-semblance-border dark:bg-semblance-border-dark'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                monitoringEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Recent Actions */}
        {recentActions.length > 0 && (
          <div>
            <p className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2">
              Recent clipboard actions
            </p>
            <div className="space-y-1">
              {recentActions.slice(0, 5).map((action, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                  <span>{action.patternType}: {action.action}</span>
                  <span className="text-semblance-text-tertiary">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

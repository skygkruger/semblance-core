// ClipboardSettingsSection — Settings section for clipboard monitoring.
// Uses Settings.css classes from semblance-ui for visual parity.

import { SkeletonCard } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import '@semblance/ui/components/Settings/Settings.css';

interface ClipboardAction {
  patternType: string;
  action: string;
  timestamp: string;
}

export interface ClipboardSettingsSectionProps {
  monitoringEnabled?: boolean;
  recentActions?: ClipboardAction[];
  onToggle?: () => void;
}

export function ClipboardSettingsSection({
  monitoringEnabled: enabledProp,
  recentActions: actionsProp,
  onToggle,
}: ClipboardSettingsSectionProps = {}) {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const monitoringEnabled = enabledProp ?? state.clipboardSettings?.monitoringEnabled ?? false;
  const recentActions = actionsProp ?? state.clipboardSettings?.recentActions ?? [];

  const handleToggle = onToggle ?? (() => {
    dispatch({
      type: 'SET_CLIPBOARD_MONITORING',
      enabled: !monitoringEnabled,
    });
  });

  return (
    <div className="settings-content">
      <div className="settings-section-header">Clipboard Intelligence</div>

      <div className="settings-row" onClick={handleToggle}>
        <span className="settings-row__label">Clipboard monitoring</span>
        <button
          type="button"
          className="settings-toggle"
          data-on={String(monitoringEnabled)}
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
        >
          <span className="settings-toggle__thumb" />
        </button>
      </div>

      <p className="settings-explanation">
        When enabled, Semblance watches your clipboard for actionable content like tracking numbers, flight codes, and URLs. All processing happens locally on your device.
      </p>

      {!monitoringEnabled && (
        <div style={{ padding: '16px 16px 0' }}>
          <SkeletonCard
            variant="generic"
            message="Enable to detect actionable clipboard content"
            showSpinner={false}
            height={120}
          />
        </div>
      )}

      {monitoringEnabled && recentActions.length === 0 && (
        <div style={{ padding: '16px 16px 0' }}>
          <SkeletonCard
            variant="generic"
            message="Watching clipboard"
            subMessage="Actions will appear here as patterns are detected"
            height={120}
          />
        </div>
      )}

      {monitoringEnabled && recentActions.length > 0 && (
        <>
          <div className="settings-section-header">Recent clipboard actions</div>
          {recentActions.slice(0, 5).map((action, i) => (
            <div key={i} className="settings-row settings-row--static">
              <span className="settings-row__label">{action.patternType}: {action.action}</span>
              <span className="settings-row__value">
                {new Date(action.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

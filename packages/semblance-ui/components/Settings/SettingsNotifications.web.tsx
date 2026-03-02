import './Settings.css';
import { BackArrow } from './SettingsIcons';
import type { SettingsNotificationsProps } from './SettingsNotifications.types';
import { snoozeLabels, digestLabels } from './SettingsNotifications.types';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="settings-toggle" data-on={String(on)} onClick={onToggle}>
      <span className="settings-toggle__thumb" />
    </button>
  );
}

export function SettingsNotifications({
  morningBriefEnabled,
  morningBriefTime,
  includeWeather,
  includeCalendar,
  remindersEnabled,
  defaultSnoozeDuration,
  notifyOnAction,
  notifyOnApproval,
  actionDigest,
  badgeCount,
  soundEffects,
  onChange,
  onBack,
}: SettingsNotificationsProps) {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">Notifications</h1>
      </div>

      <div className="settings-content">
        {/* Morning Brief */}
        <div className="settings-section-header">Morning Brief</div>

        <div className="settings-row" onClick={() => onChange('morningBriefEnabled', !morningBriefEnabled)}>
          <span className="settings-row__label">Morning Brief enabled</span>
          <Toggle on={morningBriefEnabled} onToggle={() => onChange('morningBriefEnabled', !morningBriefEnabled)} />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Delivery time</span>
          <span className="settings-row__value">{morningBriefTime}</span>
        </div>

        <div className="settings-row" onClick={() => onChange('includeWeather', !includeWeather)}>
          <span className="settings-row__label">Include weather</span>
          <Toggle on={includeWeather} onToggle={() => onChange('includeWeather', !includeWeather)} />
        </div>

        <div className="settings-row" onClick={() => onChange('includeCalendar', !includeCalendar)}>
          <span className="settings-row__label">Include calendar preview</span>
          <Toggle on={includeCalendar} onToggle={() => onChange('includeCalendar', !includeCalendar)} />
        </div>

        {/* Reminders */}
        <div className="settings-section-header">Reminders</div>

        <div className="settings-row" onClick={() => onChange('remindersEnabled', !remindersEnabled)}>
          <span className="settings-row__label">Reminder notifications</span>
          <Toggle on={remindersEnabled} onToggle={() => onChange('remindersEnabled', !remindersEnabled)} />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Default snooze duration</span>
          <span className="settings-row__value">{snoozeLabels[defaultSnoozeDuration]}</span>
        </div>

        {/* Autonomous Actions */}
        <div className="settings-section-header">Autonomous Actions</div>

        <div className="settings-row" onClick={() => onChange('notifyOnAction', !notifyOnAction)}>
          <span className="settings-row__label">Notify when action taken</span>
          <Toggle on={notifyOnAction} onToggle={() => onChange('notifyOnAction', !notifyOnAction)} />
        </div>

        <div className="settings-row" onClick={() => onChange('notifyOnApproval', !notifyOnApproval)}>
          <span className="settings-row__label">Notify when approval needed</span>
          <Toggle on={notifyOnApproval} onToggle={() => onChange('notifyOnApproval', !notifyOnApproval)} />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">Action digest</span>
          <span className="settings-row__value">{digestLabels[actionDigest]}</span>
        </div>

        {/* System */}
        <div className="settings-section-header">System</div>

        <div className="settings-row" onClick={() => onChange('badgeCount', !badgeCount)}>
          <span className="settings-row__label">Badge count on app icon</span>
          <Toggle on={badgeCount} onToggle={() => onChange('badgeCount', !badgeCount)} />
        </div>

        <div className="settings-row" onClick={() => onChange('soundEffects', !soundEffects)}>
          <span className="settings-row__label">Sound effects</span>
          <Toggle on={soundEffects} onToggle={() => onChange('soundEffects', !soundEffects)} />
        </div>
      </div>
    </div>
  );
}

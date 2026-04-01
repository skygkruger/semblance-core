import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <button type="button" className="settings-header__back" onClick={onBack}>
          <BackArrow />
        </button>
        <h1 className="settings-header__title">{t('notifications.title')}</h1>
      </div>

      <div className="settings-content">
        {/* Morning Brief */}
        <div className="settings-section-header bracket-section">{t('notifications.section_morning_brief')}</div>

        <div className="settings-row" onClick={() => onChange('morningBriefEnabled', !morningBriefEnabled)}>
          <span className="settings-row__label">{t('notifications.label_morning_brief_enabled')}</span>
          <Toggle on={morningBriefEnabled} onToggle={() => onChange('morningBriefEnabled', !morningBriefEnabled)} />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{t('notifications.label_delivery_time')}</span>
          <input
            type="time"
            value={morningBriefTime}
            onChange={(e) => onChange('morningBriefTime', e.target.value)}
            style={{
              background: '#0B0E11', border: '1px solid #2A3038', borderRadius: 6,
              color: '#EEF1F4', fontFamily: "'DM Mono', monospace", fontSize: 13,
              padding: '4px 8px', outline: 'none',
            }}
          />
        </div>

        <div className="settings-row" onClick={() => onChange('includeWeather', !includeWeather)}>
          <span className="settings-row__label">{t('notifications.label_include_weather')}</span>
          <Toggle on={includeWeather} onToggle={() => onChange('includeWeather', !includeWeather)} />
        </div>

        <div className="settings-row" onClick={() => onChange('includeCalendar', !includeCalendar)}>
          <span className="settings-row__label">{t('notifications.label_include_calendar')}</span>
          <Toggle on={includeCalendar} onToggle={() => onChange('includeCalendar', !includeCalendar)} />
        </div>

        {/* Reminders */}
        <div className="settings-section-header bracket-section">{t('notifications.section_reminders')}</div>

        <div className="settings-row" onClick={() => onChange('remindersEnabled', !remindersEnabled)}>
          <span className="settings-row__label">{t('notifications.label_reminder_notifications')}</span>
          <Toggle on={remindersEnabled} onToggle={() => onChange('remindersEnabled', !remindersEnabled)} />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{t('notifications.label_default_snooze')}</span>
          <select
            value={defaultSnoozeDuration}
            onChange={(e) => onChange('defaultSnoozeDuration', e.target.value)}
            style={{
              background: '#0B0E11', border: '1px solid #2A3038', borderRadius: 6,
              color: '#EEF1F4', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              padding: '4px 8px', outline: 'none', cursor: 'pointer',
            }}
          >
            {Object.entries(snoozeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Autonomous Actions */}
        <div className="settings-section-header bracket-section">{t('notifications.section_autonomous_actions')}</div>

        <div className="settings-row" onClick={() => onChange('notifyOnAction', !notifyOnAction)}>
          <span className="settings-row__label">{t('notifications.label_notify_on_action')}</span>
          <Toggle on={notifyOnAction} onToggle={() => onChange('notifyOnAction', !notifyOnAction)} />
        </div>

        <div className="settings-row" onClick={() => onChange('notifyOnApproval', !notifyOnApproval)}>
          <span className="settings-row__label">{t('notifications.label_notify_on_approval')}</span>
          <Toggle on={notifyOnApproval} onToggle={() => onChange('notifyOnApproval', !notifyOnApproval)} />
        </div>

        <div className="settings-row settings-row--static">
          <span className="settings-row__label">{t('notifications.label_action_digest')}</span>
          <select
            value={actionDigest}
            onChange={(e) => onChange('actionDigest', e.target.value)}
            style={{
              background: '#0B0E11', border: '1px solid #2A3038', borderRadius: 6,
              color: '#EEF1F4', fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              padding: '4px 8px', outline: 'none', cursor: 'pointer',
            }}
          >
            {Object.entries(digestLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* System */}
        <div className="settings-section-header bracket-section">{t('notifications.section_system')}</div>

        <div className="settings-row" onClick={() => onChange('badgeCount', !badgeCount)}>
          <span className="settings-row__label">{t('notifications.label_badge_count')}</span>
          <Toggle on={badgeCount} onToggle={() => onChange('badgeCount', !badgeCount)} />
        </div>

        <div className="settings-row" onClick={() => onChange('soundEffects', !soundEffects)}>
          <span className="settings-row__label">{t('notifications.label_sound_effects')}</span>
          <Toggle on={soundEffects} onToggle={() => onChange('soundEffects', !soundEffects)} />
        </div>
      </div>
    </div>
  );
}

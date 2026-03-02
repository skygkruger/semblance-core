export interface SettingsNotificationsProps {
  morningBriefEnabled: boolean;
  morningBriefTime: string;
  includeWeather: boolean;
  includeCalendar: boolean;
  remindersEnabled: boolean;
  defaultSnoozeDuration: '5m' | '15m' | '1h' | '1d';
  notifyOnAction: boolean;
  notifyOnApproval: boolean;
  actionDigest: 'immediate' | 'hourly' | 'daily';
  badgeCount: boolean;
  soundEffects: boolean;
  onChange: (key: string, value: unknown) => void;
  onBack: () => void;
}

export const snoozeLabels: Record<string, string> = { '5m': '5 min', '15m': '15 min', '1h': '1 hour', '1d': '1 day' };
export const digestLabels: Record<string, string> = { immediate: 'Immediate', hourly: 'Hourly', daily: 'Daily summary' };

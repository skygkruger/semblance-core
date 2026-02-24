// Local Notifications — Schedule and manage local-only notifications.
// NO remote push. NO notification servers. All scheduling is on-device.
// Types: reminder due, proactive insight, morning digest.

export type NotificationType = 'reminder' | 'insight' | 'digest' | 'routing' | 'morning_brief' | 'alter_ego_week';

export interface LocalNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Scheduled fire date */
  fireDate: Date;
  /** Actions available on the notification (e.g., snooze, dismiss) */
  actions?: NotificationAction[];
  /** Arbitrary data payload */
  data?: Record<string, string>;
}

export interface NotificationAction {
  id: string;
  label: string;
  /** Whether this action opens the app */
  foreground: boolean;
}

export interface NotificationProvider {
  schedule(notification: LocalNotification): Promise<void>;
  cancel(notificationId: string): Promise<void>;
  cancelAll(): Promise<void>;
  getScheduled(): Promise<LocalNotification[]>;
}

/**
 * Build a reminder notification with snooze/dismiss actions.
 */
export function buildReminderNotification(
  reminderId: string,
  text: string,
  dueAt: Date,
): LocalNotification {
  return {
    id: `reminder-${reminderId}`,
    type: 'reminder',
    title: 'Reminder',
    body: text,
    fireDate: dueAt,
    actions: [
      { id: 'snooze', label: 'Snooze', foreground: false },
      { id: 'dismiss', label: 'Dismiss', foreground: false },
    ],
    data: { reminderId },
  };
}

/**
 * Build a proactive insight notification.
 */
export function buildInsightNotification(
  insightId: string,
  title: string,
  body: string,
  fireDate: Date,
): LocalNotification {
  return {
    id: `insight-${insightId}`,
    type: 'insight',
    title,
    body,
    fireDate,
    data: { insightId },
  };
}

/**
 * Build a morning digest notification.
 */
export function buildDigestNotification(
  digestDate: Date,
  summary: string,
): LocalNotification {
  // Schedule for 8am on the digest date
  const fire = new Date(digestDate);
  fire.setHours(8, 0, 0, 0);

  return {
    id: `digest-${digestDate.toISOString().slice(0, 10)}`,
    type: 'digest',
    title: 'Your Daily Digest',
    body: summary,
    fireDate: fire,
    data: { date: digestDate.toISOString().slice(0, 10) },
  };
}

/**
 * Build a routing transparency notification.
 */
export function buildRoutingNotification(
  taskId: string,
  deviceName: string,
): LocalNotification {
  return {
    id: `routing-${taskId}`,
    type: 'routing',
    title: 'Processing on Desktop',
    body: `Running on ${deviceName}...`,
    fireDate: new Date(),
    data: { taskId },
  };
}

/**
 * Build an Alter Ego Week daily notification.
 */
export function buildAlterEgoWeekNotification(
  day: number,
  theme: string,
  description: string,
): LocalNotification {
  return {
    id: `alter-ego-week-day-${day}`,
    type: 'alter_ego_week',
    title: `Alter Ego Week — Day ${day}: ${theme}`,
    body: description,
    fireDate: new Date(),
    actions: [
      { id: 'start', label: 'Start', foreground: true },
      { id: 'skip', label: 'Skip', foreground: false },
    ],
    data: { day: String(day), theme },
  };
}

/**
 * NotificationScheduler manages the lifecycle of local notifications.
 * Ensures no remote push, no notification servers.
 */
export class NotificationScheduler {
  private provider: NotificationProvider | null;

  constructor(provider?: NotificationProvider) {
    this.provider = provider ?? null;
  }

  async scheduleReminder(reminderId: string, text: string, dueAt: Date): Promise<void> {
    if (!this.provider) return;
    const notification = buildReminderNotification(reminderId, text, dueAt);
    await this.provider.schedule(notification);
  }

  async cancelReminder(reminderId: string): Promise<void> {
    if (!this.provider) return;
    await this.provider.cancel(`reminder-${reminderId}`);
  }

  async scheduleInsight(insightId: string, title: string, body: string, fireDate: Date): Promise<void> {
    if (!this.provider) return;
    const notification = buildInsightNotification(insightId, title, body, fireDate);
    await this.provider.schedule(notification);
  }

  async scheduleDigest(date: Date, summary: string): Promise<void> {
    if (!this.provider) return;
    const notification = buildDigestNotification(date, summary);
    await this.provider.schedule(notification);
  }

  async getScheduledCount(): Promise<number> {
    if (!this.provider) return 0;
    const scheduled = await this.provider.getScheduled();
    return scheduled.length;
  }

  async cancelAll(): Promise<void> {
    if (!this.provider) return;
    await this.provider.cancelAll();
  }
}

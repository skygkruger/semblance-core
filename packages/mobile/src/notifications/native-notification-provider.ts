// Native Notification Provider — Bridge to OS notification APIs via @notifee/react-native.
// Local only. No remote push. No notification servers.
// Android: NotificationManager channels.
// iOS: UNUserNotificationCenter.

import notifee, { AuthorizationStatus, AndroidImportance } from '@notifee/react-native';
import type { NotificationProvider, LocalNotification } from './local-notifications';

/**
 * Map notification categories to Android channel names.
 */
function channelName(category?: string): string {
  const names: Record<string, string> = {
    reminder: 'Reminders',
    insight: 'Insights',
    digest: 'Daily Digest',
    routing: 'Task Routing',
    morning_brief: 'Morning Brief',
    alter_ego_week: 'Alter Ego',
  };
  return names[category ?? ''] ?? 'Semblance';
}

/**
 * Map notification categories to Android channel IDs.
 */
function channelId(category?: string): string {
  return category ?? 'default';
}

export class NativeNotificationProvider implements NotificationProvider {
  /**
   * Request notification permission from the user.
   * Returns true if permission was granted.
   */
  async requestPermission(): Promise<boolean> {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  }

  async schedule(notification: LocalNotification): Promise<void> {
    const catId = channelId(notification.type);

    // Create Android channel (no-op on iOS, idempotent on Android)
    await notifee.createChannel({
      id: catId,
      name: channelName(notification.type),
      importance: AndroidImportance.HIGH,
    });

    // For immediate notifications, display directly.
    // For future-dated, use trigger notifications.
    const now = Date.now();
    const fireTime = notification.fireDate.getTime();

    if (fireTime <= now + 1000) {
      // Fire immediately
      await notifee.displayNotification({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        android: {
          channelId: catId,
          pressAction: { id: 'default' },
          smallIcon: 'ic_notification',
        },
        data: notification.data ?? undefined,
      });
    } else {
      // Schedule for future delivery
      await notifee.createTriggerNotification(
        {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          android: {
            channelId: catId,
            pressAction: { id: 'default' },
            smallIcon: 'ic_notification',
          },
          data: notification.data ?? undefined,
        },
        {
          type: 0, // TriggerType.TIMESTAMP
          timestamp: fireTime,
        },
      );
    }
  }

  async cancel(notificationId: string): Promise<void> {
    await notifee.cancelNotification(notificationId);
  }

  async cancelAll(): Promise<void> {
    await notifee.cancelAllNotifications();
  }

  async getScheduled(): Promise<LocalNotification[]> {
    const triggers = await notifee.getTriggerNotifications();
    return triggers.map((t) => ({
      id: t.notification.id ?? '',
      type: 'reminder' as const,
      title: t.notification.title ?? '',
      body: t.notification.body ?? '',
      fireDate: new Date(),
      data: (t.notification.data ?? undefined) as Record<string, string> | undefined,
    }));
  }
}

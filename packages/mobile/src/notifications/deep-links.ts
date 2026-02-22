// Deep Links — Notification tap → screen navigation mapping.
//
// When a user taps a local notification, this module resolves the
// notification's type and data payload into a navigation target.
//
// No network calls. No external deep link URLs. All navigation is internal.

export type ScreenName = 'inbox' | 'chat' | 'reminders' | 'settings' | 'search' | 'network-monitor';

export interface DeepLinkTarget {
  screen: ScreenName;
  params?: Record<string, string>;
}

export interface NotificationPayload {
  type: string;
  data?: Record<string, string>;
}

/**
 * Resolve a notification tap into a navigation target.
 * Returns the screen to navigate to and optional params.
 */
export function resolveDeepLink(payload: NotificationPayload): DeepLinkTarget {
  switch (payload.type) {
    case 'reminder':
      return {
        screen: 'reminders',
        params: payload.data?.reminderId
          ? { reminderId: payload.data.reminderId }
          : undefined,
      };

    case 'insight':
      return {
        screen: 'inbox',
        params: payload.data?.insightId
          ? { insightId: payload.data.insightId }
          : undefined,
      };

    case 'digest':
      return {
        screen: 'inbox',
        params: { tab: 'digest' },
      };

    case 'routing':
      return {
        screen: 'network-monitor',
        params: payload.data?.taskId
          ? { taskId: payload.data.taskId }
          : undefined,
      };

    default:
      return { screen: 'inbox' };
  }
}

/**
 * Resolve a notification action (e.g., snooze, dismiss) into a command.
 */
export function resolveNotificationAction(
  notificationType: string,
  actionId: string,
  data?: Record<string, string>,
): { action: string; params: Record<string, string> } | null {
  if (notificationType === 'reminder') {
    if (actionId === 'snooze' && data?.reminderId) {
      return { action: 'reminder.snooze', params: { reminderId: data.reminderId } };
    }
    if (actionId === 'dismiss' && data?.reminderId) {
      return { action: 'reminder.dismiss', params: { reminderId: data.reminderId } };
    }
  }

  return null;
}

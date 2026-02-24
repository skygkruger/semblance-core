// Morning Brief Notification — Build local notification for morning brief delivery.
// NO remote push. All scheduling is on-device.

import type { LocalNotification } from './local-notifications.js';

/**
 * Build a morning brief notification with view/dismiss actions.
 */
export function buildMorningBriefNotification(
  briefDate: Date,
  summary: string,
  deliveryTime: Date,
): LocalNotification {
  return {
    id: `morning-brief-${briefDate.toISOString().slice(0, 10)}`,
    type: 'morning_brief' as LocalNotification['type'],
    title: 'Good Morning',
    body: summary,
    fireDate: deliveryTime,
    actions: [
      { id: 'view_brief', label: 'View', foreground: true },
      { id: 'dismiss', label: 'Dismiss', foreground: false },
    ],
    data: { date: briefDate.toISOString().slice(0, 10) },
  };
}

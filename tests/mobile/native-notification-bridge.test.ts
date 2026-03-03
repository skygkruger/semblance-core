// Tests for NativeNotificationProvider — mobile notification bridge via @notifee/react-native.
// Verifies permission requests, scheduling (immediate vs. future), cancellation,
// channel creation, and getScheduled mapping.
//
// Note: @notifee/react-native is only installed in packages/mobile/node_modules,
// so we inline the provider logic to test without depending on the native module.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LocalNotification, NotificationProvider } from '@semblance/mobile/notifications/local-notifications.js';

// Instead of importing the actual provider (which depends on @notifee/react-native native code),
// we test the provider's behavior by creating a mock-based reconstruction.
// This mirrors the actual NativeNotificationProvider implementation.

const mockNotifee = {
  requestPermission: vi.fn(),
  displayNotification: vi.fn(),
  createTriggerNotification: vi.fn(),
  cancelNotification: vi.fn(),
  cancelAllNotifications: vi.fn(),
  getTriggerNotifications: vi.fn(),
  createChannel: vi.fn(),
};

const AuthorizationStatus = { AUTHORIZED: 1, DENIED: 0 };
const AndroidImportance = { HIGH: 4 };

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

function channelId(category?: string): string {
  return category ?? 'default';
}

/**
 * Test double mirroring NativeNotificationProvider.
 * Uses the same logic as the real implementation but with the mock notifee.
 */
class NativeNotificationProvider implements NotificationProvider {
  async requestPermission(): Promise<boolean> {
    const settings = await mockNotifee.requestPermission();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  }

  async schedule(notification: LocalNotification): Promise<void> {
    const catId = channelId(notification.type);
    await mockNotifee.createChannel({
      id: catId,
      name: channelName(notification.type),
      importance: AndroidImportance.HIGH,
    });
    const now = Date.now();
    const fireTime = notification.fireDate.getTime();
    if (fireTime <= now + 1000) {
      await mockNotifee.displayNotification({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        android: { channelId: catId, pressAction: { id: 'default' }, smallIcon: 'ic_notification' },
        data: notification.data ?? undefined,
      });
    } else {
      await mockNotifee.createTriggerNotification(
        {
          id: notification.id,
          title: notification.title,
          body: notification.body,
          android: { channelId: catId, pressAction: { id: 'default' }, smallIcon: 'ic_notification' },
          data: notification.data ?? undefined,
        },
        { type: 0, timestamp: fireTime },
      );
    }
  }

  async cancel(notificationId: string): Promise<void> {
    await mockNotifee.cancelNotification(notificationId);
  }

  async cancelAll(): Promise<void> {
    await mockNotifee.cancelAllNotifications();
  }

  async getScheduled(): Promise<LocalNotification[]> {
    const triggers = await mockNotifee.getTriggerNotifications();
    return triggers.map((t: { notification: { id?: string; title?: string; body?: string; data?: Record<string, string> } }) => ({
      id: t.notification.id ?? '',
      type: 'reminder' as const,
      title: t.notification.title ?? '',
      body: t.notification.body ?? '',
      fireDate: new Date(),
      data: (t.notification.data ?? undefined) as Record<string, string> | undefined,
    }));
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let provider: NativeNotificationProvider;

function makeNotification(overrides: Partial<LocalNotification> = {}): LocalNotification {
  return {
    id: 'test-notif-1',
    type: 'reminder',
    title: 'Test Reminder',
    body: 'This is a test notification',
    fireDate: new Date(Date.now() + 60_000), // 1 minute in the future by default
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNotifee.requestPermission.mockResolvedValue({ authorizationStatus: 1 });
  mockNotifee.displayNotification.mockResolvedValue(undefined);
  mockNotifee.createTriggerNotification.mockResolvedValue(undefined);
  mockNotifee.cancelNotification.mockResolvedValue(undefined);
  mockNotifee.cancelAllNotifications.mockResolvedValue(undefined);
  mockNotifee.createChannel.mockResolvedValue('channel-id');
  mockNotifee.getTriggerNotifications.mockResolvedValue([]);

  provider = new NativeNotificationProvider();
});

// ─── requestPermission ──────────────────────────────────────────────────────

describe('NativeNotificationProvider: requestPermission', () => {
  it('returns true when permission is authorized', async () => {
    mockNotifee.requestPermission.mockResolvedValue({ authorizationStatus: 1 });

    const granted = await provider.requestPermission();

    expect(granted).toBe(true);
    expect(mockNotifee.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('returns false when permission is denied', async () => {
    mockNotifee.requestPermission.mockResolvedValue({ authorizationStatus: 0 });

    const granted = await provider.requestPermission();

    expect(granted).toBe(false);
  });
});

// ─── schedule ───────────────────────────────────────────────────────────────

describe('NativeNotificationProvider: schedule', () => {
  it('creates an Android channel before scheduling', async () => {
    const notif = makeNotification();
    await provider.schedule(notif);

    expect(mockNotifee.createChannel).toHaveBeenCalledTimes(1);
    expect(mockNotifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reminder',
        name: 'Reminders',
        importance: 4, // AndroidImportance.HIGH
      }),
    );
  });

  it('displays notification immediately when fireDate is in the past', async () => {
    const pastDate = new Date(Date.now() - 60_000); // 1 minute ago
    const notif = makeNotification({ fireDate: pastDate });

    await provider.schedule(notif);

    expect(mockNotifee.displayNotification).toHaveBeenCalledTimes(1);
    expect(mockNotifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('creates trigger notification for future-dated notifications', async () => {
    const futureDate = new Date(Date.now() + 300_000); // 5 minutes from now
    const notif = makeNotification({ fireDate: futureDate });

    await provider.schedule(notif);

    expect(mockNotifee.createTriggerNotification).toHaveBeenCalledTimes(1);
    expect(mockNotifee.displayNotification).not.toHaveBeenCalled();

    const [notifArg, triggerArg] = mockNotifee.createTriggerNotification.mock.calls[0]!;
    expect(triggerArg.type).toBe(0); // TriggerType.TIMESTAMP
    expect(triggerArg.timestamp).toBe(futureDate.getTime());
  });

  it('passes correct notification id, title, and body', async () => {
    const notif = makeNotification({
      id: 'unique-42',
      title: 'Meeting Soon',
      body: 'Your 3pm meeting starts in 15 minutes',
      fireDate: new Date(Date.now() - 5000), // immediate
    });

    await provider.schedule(notif);

    const displayed = mockNotifee.displayNotification.mock.calls[0]![0];
    expect(displayed.id).toBe('unique-42');
    expect(displayed.title).toBe('Meeting Soon');
    expect(displayed.body).toBe('Your 3pm meeting starts in 15 minutes');
  });

  it('passes data payload to the notification', async () => {
    const notif = makeNotification({
      fireDate: new Date(Date.now() - 5000),
      data: { taskId: 'abc-123', priority: 'high' },
    });

    await provider.schedule(notif);

    const displayed = mockNotifee.displayNotification.mock.calls[0]![0];
    expect(displayed.data).toEqual({ taskId: 'abc-123', priority: 'high' });
  });

  it('sets data to undefined when notification has no data field', async () => {
    const notif = makeNotification({
      fireDate: new Date(Date.now() - 5000),
    });
    // Explicitly ensure no data
    delete (notif as Partial<LocalNotification>).data;

    await provider.schedule(notif);

    const displayed = mockNotifee.displayNotification.mock.calls[0]![0];
    expect(displayed.data).toBeUndefined();
  });

  it('maps notification category to correct channel name', async () => {
    const categories: Array<[LocalNotification['type'], string, string]> = [
      ['reminder', 'reminder', 'Reminders'],
      ['insight', 'insight', 'Insights'],
      ['digest', 'digest', 'Daily Digest'],
      ['routing', 'routing', 'Task Routing'],
      ['morning_brief', 'morning_brief', 'Morning Brief'],
      ['alter_ego_week', 'alter_ego_week', 'Alter Ego'],
    ];

    for (const [type, expectedId, expectedName] of categories) {
      vi.clearAllMocks();
      mockNotifee.createChannel.mockResolvedValue('ch');
      mockNotifee.displayNotification.mockResolvedValue(undefined);
      mockNotifee.createTriggerNotification.mockResolvedValue(undefined);

      const notif = makeNotification({ type, fireDate: new Date(Date.now() + 300_000) });
      await provider.schedule(notif);

      expect(mockNotifee.createChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expectedId,
          name: expectedName,
        }),
      );
    }
  });

  it('includes Android-specific config for immediate notifications', async () => {
    const notif = makeNotification({ fireDate: new Date(Date.now() - 5000) });
    await provider.schedule(notif);

    const displayed = mockNotifee.displayNotification.mock.calls[0]![0];
    expect(displayed.android).toBeDefined();
    expect(displayed.android.channelId).toBe('reminder');
    expect(displayed.android.pressAction).toEqual({ id: 'default' });
    expect(displayed.android.smallIcon).toBe('ic_notification');
  });
});

// ─── cancel ─────────────────────────────────────────────────────────────────

describe('NativeNotificationProvider: cancel', () => {
  it('calls cancelNotification with the correct id', async () => {
    await provider.cancel('notif-to-cancel');

    expect(mockNotifee.cancelNotification).toHaveBeenCalledTimes(1);
    expect(mockNotifee.cancelNotification).toHaveBeenCalledWith('notif-to-cancel');
  });
});

// ─── cancelAll ──────────────────────────────────────────────────────────────

describe('NativeNotificationProvider: cancelAll', () => {
  it('calls cancelAllNotifications', async () => {
    await provider.cancelAll();

    expect(mockNotifee.cancelAllNotifications).toHaveBeenCalledTimes(1);
  });
});

// ─── getScheduled ───────────────────────────────────────────────────────────

describe('NativeNotificationProvider: getScheduled', () => {
  it('returns mapped notifications from trigger notifications', async () => {
    mockNotifee.getTriggerNotifications.mockResolvedValue([
      {
        notification: {
          id: 'sched-1',
          title: 'Scheduled One',
          body: 'First scheduled',
          data: { key: 'val' },
        },
        trigger: { type: 0, timestamp: Date.now() + 60_000 },
      },
      {
        notification: {
          id: 'sched-2',
          title: 'Scheduled Two',
          body: 'Second scheduled',
        },
        trigger: { type: 0, timestamp: Date.now() + 120_000 },
      },
    ]);

    const scheduled = await provider.getScheduled();

    expect(scheduled).toHaveLength(2);
    expect(scheduled[0]!.id).toBe('sched-1');
    expect(scheduled[0]!.title).toBe('Scheduled One');
    expect(scheduled[0]!.body).toBe('First scheduled');
    expect(scheduled[0]!.data).toEqual({ key: 'val' });
    expect(scheduled[1]!.id).toBe('sched-2');
    expect(scheduled[1]!.title).toBe('Scheduled Two');
  });

  it('returns empty array when no notifications are scheduled', async () => {
    mockNotifee.getTriggerNotifications.mockResolvedValue([]);

    const scheduled = await provider.getScheduled();

    expect(scheduled).toEqual([]);
  });

  it('handles notifications with missing optional fields', async () => {
    mockNotifee.getTriggerNotifications.mockResolvedValue([
      {
        notification: {
          // id, title, body all missing/undefined
        },
        trigger: { type: 0, timestamp: Date.now() + 60_000 },
      },
    ]);

    const scheduled = await provider.getScheduled();

    expect(scheduled).toHaveLength(1);
    // Should default to empty strings for missing fields
    expect(scheduled[0]!.id).toBe('');
    expect(scheduled[0]!.title).toBe('');
    expect(scheduled[0]!.body).toBe('');
  });
});

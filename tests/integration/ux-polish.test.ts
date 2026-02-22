/**
 * UX Polish Tests — Gestures, haptics, notifications, deep links.
 *
 * Tests:
 * - Swipe gesture triggers correct action
 * - Haptic feedback fires on action completion
 * - Notifications schedule and fire
 * - Deep links navigate correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Swipe actions
import {
  calculateSwipeState,
  getActiveSwipeAction,
  createInboxSwipeActions,
  swipeProgress,
  DEFAULT_SWIPE_CONFIG,
} from '../../packages/mobile/src/gestures/swipe-actions.js';
import type { SwipeAction } from '../../packages/mobile/src/gestures/swipe-actions.js';

// Haptics
import {
  getHapticForAction,
  createHapticController,
} from '../../packages/mobile/src/gestures/haptics.js';
import type { HapticProvider } from '../../packages/mobile/src/gestures/haptics.js';

// Notifications
import {
  buildReminderNotification,
  buildInsightNotification,
  buildDigestNotification,
  buildRoutingNotification,
  NotificationScheduler,
} from '../../packages/mobile/src/notifications/local-notifications.js';
import type { NotificationProvider, LocalNotification } from '../../packages/mobile/src/notifications/local-notifications.js';

// Deep links
import {
  resolveDeepLink,
  resolveNotificationAction,
} from '../../packages/mobile/src/notifications/deep-links.js';

describe('UX Polish — Gestures, Haptics, Notifications', () => {

  // ─── Swipe Gesture Tests ──────────────────────────────────────────────

  describe('swipe gestures', () => {
    it('detects right swipe direction', () => {
      const state = calculateSwipeState(50);
      expect(state.direction).toBe('right');
      expect(state.triggered).toBe(false);
    });

    it('detects left swipe direction', () => {
      const state = calculateSwipeState(-50);
      expect(state.direction).toBe('left');
      expect(state.triggered).toBe(false);
    });

    it('triggers at threshold', () => {
      const state = calculateSwipeState(80);
      expect(state.triggered).toBe(true);
      expect(state.direction).toBe('right');
    });

    it('triggers left at threshold', () => {
      const state = calculateSwipeState(-80);
      expect(state.triggered).toBe(true);
      expect(state.direction).toBe('left');
    });

    it('returns null direction for small movements', () => {
      const state = calculateSwipeState(5);
      expect(state.direction).toBeNull();
    });

    it('respects disabled config', () => {
      const state = calculateSwipeState(100, { threshold: 80, enabled: false });
      expect(state.triggered).toBe(false);
      expect(state.translateX).toBe(0);
    });

    it('gets correct action for swipe direction', () => {
      const onArchive = vi.fn();
      const onCategorize = vi.fn();
      const { right, left } = createInboxSwipeActions(onArchive, onCategorize);

      const rightSwipe = calculateSwipeState(100);
      const action = getActiveSwipeAction(rightSwipe, right, left);
      expect(action?.label).toBe('Archive');

      const leftSwipe = calculateSwipeState(-100);
      const leftAction = getActiveSwipeAction(leftSwipe, right, left);
      expect(leftAction?.label).toBe('Categorize');
    });

    it('calculates swipe progress 0-1', () => {
      expect(swipeProgress(0, 80)).toBe(0);
      expect(swipeProgress(40, 80)).toBe(0.5);
      expect(swipeProgress(80, 80)).toBe(1);
      expect(swipeProgress(160, 80)).toBe(1); // Capped at 1
    });
  });

  // ─── Haptic Feedback Tests ────────────────────────────────────────────

  describe('haptic feedback', () => {
    it('maps action to correct haptic type', () => {
      expect(getHapticForAction('email.archived')).toBe('medium');
      expect(getHapticForAction('swipe.threshold')).toBe('light');
      expect(getHapticForAction('action.failed')).toBe('error');
      expect(getHapticForAction('pairing.accepted')).toBe('success');
    });

    it('returns null for unknown action', () => {
      expect(getHapticForAction('unknown.action')).toBeNull();
    });

    it('haptic controller triggers provider', () => {
      const provider: HapticProvider = { trigger: vi.fn() };
      const controller = createHapticController(provider);

      controller.triggerAction('email.archived');
      expect(provider.trigger).toHaveBeenCalledWith('medium');
    });

    it('haptic controller no-ops without provider', () => {
      const controller = createHapticController();
      // Should not throw
      controller.triggerAction('email.archived');
      controller.trigger('medium');
    });

    it('haptic controller skips unmapped actions', () => {
      const provider: HapticProvider = { trigger: vi.fn() };
      const controller = createHapticController(provider);
      controller.triggerAction('unknown.action');
      expect(provider.trigger).not.toHaveBeenCalled();
    });
  });

  // ─── Notification Tests ───────────────────────────────────────────────

  describe('notifications schedule and fire', () => {
    it('builds reminder notification with actions', () => {
      const notif = buildReminderNotification('r1', 'Call dentist', new Date());
      expect(notif.type).toBe('reminder');
      expect(notif.title).toBe('Reminder');
      expect(notif.body).toBe('Call dentist');
      expect(notif.actions).toHaveLength(2);
      expect(notif.actions![0]!.id).toBe('snooze');
      expect(notif.actions![1]!.id).toBe('dismiss');
    });

    it('builds insight notification', () => {
      const notif = buildInsightNotification('i1', 'Meeting prep', 'You have a meeting in 30 min', new Date());
      expect(notif.type).toBe('insight');
      expect(notif.title).toBe('Meeting prep');
    });

    it('builds digest notification at 8am', () => {
      const date = new Date('2026-02-22');
      const notif = buildDigestNotification(date, 'Great week');
      expect(notif.type).toBe('digest');
      expect(notif.fireDate.getHours()).toBe(8);
    });

    it('builds routing notification', () => {
      const notif = buildRoutingNotification('t1', "Sky's MacBook");
      expect(notif.type).toBe('routing');
      expect(notif.body).toContain("Sky's MacBook");
    });

    it('scheduler schedules via provider', async () => {
      const scheduled: LocalNotification[] = [];
      const provider: NotificationProvider = {
        schedule: vi.fn(async (n) => { scheduled.push(n); }),
        cancel: vi.fn(),
        cancelAll: vi.fn(),
        getScheduled: vi.fn(async () => scheduled),
      };

      const scheduler = new NotificationScheduler(provider);
      await scheduler.scheduleReminder('r1', 'Test', new Date());
      expect(provider.schedule).toHaveBeenCalledTimes(1);

      const count = await scheduler.getScheduledCount();
      expect(count).toBe(1);
    });

    it('scheduler cancels by reminder id', async () => {
      const provider: NotificationProvider = {
        schedule: vi.fn(),
        cancel: vi.fn(),
        cancelAll: vi.fn(),
        getScheduled: vi.fn(async () => []),
      };

      const scheduler = new NotificationScheduler(provider);
      await scheduler.cancelReminder('r1');
      expect(provider.cancel).toHaveBeenCalledWith('reminder-r1');
    });

    it('scheduler no-ops without provider', async () => {
      const scheduler = new NotificationScheduler();
      // Should not throw
      await scheduler.scheduleReminder('r1', 'Test', new Date());
      const count = await scheduler.getScheduledCount();
      expect(count).toBe(0);
    });
  });

  // ─── Deep Link Tests ──────────────────────────────────────────────────

  describe('deep links navigate correctly', () => {
    it('reminder notification opens reminders screen', () => {
      const target = resolveDeepLink({ type: 'reminder', data: { reminderId: 'r1' } });
      expect(target.screen).toBe('reminders');
      expect(target.params?.reminderId).toBe('r1');
    });

    it('insight notification opens inbox', () => {
      const target = resolveDeepLink({ type: 'insight', data: { insightId: 'i1' } });
      expect(target.screen).toBe('inbox');
    });

    it('digest notification opens inbox with digest tab', () => {
      const target = resolveDeepLink({ type: 'digest' });
      expect(target.screen).toBe('inbox');
      expect(target.params?.tab).toBe('digest');
    });

    it('routing notification opens network monitor', () => {
      const target = resolveDeepLink({ type: 'routing', data: { taskId: 't1' } });
      expect(target.screen).toBe('network-monitor');
    });

    it('unknown type defaults to inbox', () => {
      const target = resolveDeepLink({ type: 'unknown' });
      expect(target.screen).toBe('inbox');
    });

    it('resolves notification actions', () => {
      const snooze = resolveNotificationAction('reminder', 'snooze', { reminderId: 'r1' });
      expect(snooze).not.toBeNull();
      expect(snooze!.action).toBe('reminder.snooze');

      const dismiss = resolveNotificationAction('reminder', 'dismiss', { reminderId: 'r1' });
      expect(dismiss).not.toBeNull();
      expect(dismiss!.action).toBe('reminder.dismiss');
    });

    it('returns null for unknown action', () => {
      const result = resolveNotificationAction('reminder', 'unknown', {});
      expect(result).toBeNull();
    });
  });
});

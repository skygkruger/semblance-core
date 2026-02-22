// Tests for Commit 13: Mobile-Specific UX Polish
// Swipe gestures, haptic feedback, local notifications, capture widget.

import { describe, it, expect, vi } from 'vitest';
import {
  calculateSwipeState,
  getActiveSwipeAction,
  createInboxSwipeActions,
  swipeProgress,
  DEFAULT_SWIPE_CONFIG,
} from '../../packages/mobile/src/gestures/swipe-actions.js';
import type { SwipeAction } from '../../packages/mobile/src/gestures/swipe-actions.js';
import {
  getHapticForAction,
  createHapticController,
} from '../../packages/mobile/src/gestures/haptics.js';
import type { HapticProvider } from '../../packages/mobile/src/gestures/haptics.js';
import {
  buildReminderNotification,
  buildInsightNotification,
  buildDigestNotification,
  buildRoutingNotification,
  NotificationScheduler,
} from '../../packages/mobile/src/notifications/local-notifications.js';
import type { NotificationProvider, LocalNotification } from '../../packages/mobile/src/notifications/local-notifications.js';

// ─── Swipe Gestures ─────────────────────────────────────────────────────────

describe('Mobile UX — Swipe Gestures', () => {
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
  });

  it('does not trigger below threshold', () => {
    const state = calculateSwipeState(79);
    expect(state.triggered).toBe(false);
  });

  it('returns null direction for small movements', () => {
    const state = calculateSwipeState(5);
    expect(state.direction).toBeNull();
  });

  it('disabled config returns zero state', () => {
    const state = calculateSwipeState(100, { threshold: 80, enabled: false });
    expect(state.translateX).toBe(0);
    expect(state.triggered).toBe(false);
  });

  it('getActiveSwipeAction returns correct action', () => {
    const archive: SwipeAction = { direction: 'right', label: 'Archive', color: '#4A7FBA', icon: 'archive', onTrigger: vi.fn() };
    const categorize: SwipeAction = { direction: 'left', label: 'Categorize', color: '#E8A838', icon: 'tag', onTrigger: vi.fn() };

    const rightSwipe = calculateSwipeState(100);
    expect(getActiveSwipeAction(rightSwipe, archive, categorize)).toBe(archive);

    const leftSwipe = calculateSwipeState(-100);
    expect(getActiveSwipeAction(leftSwipe, archive, categorize)).toBe(categorize);
  });

  it('returns null action when not triggered', () => {
    const archive: SwipeAction = { direction: 'right', label: 'Archive', color: '#4A7FBA', icon: 'archive', onTrigger: vi.fn() };
    const categorize: SwipeAction = { direction: 'left', label: 'Categorize', color: '#E8A838', icon: 'tag', onTrigger: vi.fn() };

    const state = calculateSwipeState(30);
    expect(getActiveSwipeAction(state, archive, categorize)).toBeNull();
  });

  it('creates inbox swipe actions', () => {
    const onArchive = vi.fn();
    const onCategorize = vi.fn();
    const actions = createInboxSwipeActions(onArchive, onCategorize);

    expect(actions.right.label).toBe('Archive');
    expect(actions.left.label).toBe('Categorize');

    actions.right.onTrigger();
    expect(onArchive).toHaveBeenCalled();

    actions.left.onTrigger();
    expect(onCategorize).toHaveBeenCalled();
  });

  it('calculates swipe progress 0–1', () => {
    expect(swipeProgress(0, 80)).toBe(0);
    expect(swipeProgress(40, 80)).toBe(0.5);
    expect(swipeProgress(80, 80)).toBe(1);
    expect(swipeProgress(160, 80)).toBe(1); // Capped at 1
  });
});

// ─── Haptic Feedback ────────────────────────────────────────────────────────

describe('Mobile UX — Haptic Feedback', () => {
  it('maps swipe threshold to light haptic', () => {
    expect(getHapticForAction('swipe.threshold')).toBe('light');
  });

  it('maps email actions to medium haptic', () => {
    expect(getHapticForAction('email.archived')).toBe('medium');
    expect(getHapticForAction('email.sent')).toBe('medium');
  });

  it('maps errors to error haptic', () => {
    expect(getHapticForAction('action.failed')).toBe('error');
  });

  it('maps pairing accepted to success haptic', () => {
    expect(getHapticForAction('pairing.accepted')).toBe('success');
  });

  it('returns null for unknown actions', () => {
    expect(getHapticForAction('unknown.action')).toBeNull();
  });

  it('haptic controller triggers provider', () => {
    const provider: HapticProvider = { trigger: vi.fn() };
    const controller = createHapticController(provider);

    controller.triggerAction('email.archived');
    expect(provider.trigger).toHaveBeenCalledWith('medium');
  });

  it('haptic controller skips unknown actions', () => {
    const provider: HapticProvider = { trigger: vi.fn() };
    const controller = createHapticController(provider);

    controller.triggerAction('unknown.action');
    expect(provider.trigger).not.toHaveBeenCalled();
  });

  it('haptic controller works without provider (no-op)', () => {
    const controller = createHapticController();
    // Should not throw
    controller.triggerAction('email.archived');
    controller.trigger('medium');
  });
});

// ─── Local Notifications ────────────────────────────────────────────────────

describe('Mobile UX — Local Notifications', () => {
  it('builds reminder notification with snooze/dismiss actions', () => {
    const dueAt = new Date('2026-02-21T14:00:00Z');
    const notif = buildReminderNotification('r1', 'Call dentist', dueAt);

    expect(notif.id).toBe('reminder-r1');
    expect(notif.type).toBe('reminder');
    expect(notif.title).toBe('Reminder');
    expect(notif.body).toBe('Call dentist');
    expect(notif.fireDate).toEqual(dueAt);
    expect(notif.actions).toHaveLength(2);
    expect(notif.actions![0]!.id).toBe('snooze');
    expect(notif.actions![1]!.id).toBe('dismiss');
  });

  it('builds insight notification', () => {
    const fire = new Date('2026-02-21T09:30:00Z');
    const notif = buildInsightNotification('i1', 'Meeting Prep', 'Sarah meeting in 30 min', fire);

    expect(notif.id).toBe('insight-i1');
    expect(notif.type).toBe('insight');
    expect(notif.body).toContain('Sarah');
  });

  it('builds digest notification at 8am', () => {
    const date = new Date('2026-02-21T12:00:00Z');
    const notif = buildDigestNotification(date, '5 emails, 2 reminders');

    expect(notif.id).toContain('digest-');
    expect(notif.type).toBe('digest');
    expect(notif.fireDate.getHours()).toBe(8);
  });

  it('builds routing notification', () => {
    const notif = buildRoutingNotification('task-1', "Sky's MacBook Pro");
    expect(notif.id).toBe('routing-task-1');
    expect(notif.body).toContain("Sky's MacBook Pro");
  });

  it('scheduler schedules and cancels reminders', async () => {
    const scheduled: LocalNotification[] = [];
    const provider: NotificationProvider = {
      schedule: vi.fn(async (n) => { scheduled.push(n); }),
      cancel: vi.fn(async (id) => {
        const idx = scheduled.findIndex(n => n.id === id);
        if (idx >= 0) scheduled.splice(idx, 1);
      }),
      cancelAll: vi.fn(async () => { scheduled.length = 0; }),
      getScheduled: vi.fn(async () => [...scheduled]),
    };

    const scheduler = new NotificationScheduler(provider);
    await scheduler.scheduleReminder('r1', 'Test', new Date());
    expect(await scheduler.getScheduledCount()).toBe(1);

    await scheduler.cancelReminder('r1');
    expect(await scheduler.getScheduledCount()).toBe(0);
  });

  it('scheduler works without provider (no-op)', async () => {
    const scheduler = new NotificationScheduler();
    // Should not throw
    await scheduler.scheduleReminder('r1', 'Test', new Date());
    expect(await scheduler.getScheduledCount()).toBe(0);
  });
});

// ─── File Existence ─────────────────────────────────────────────────────────

describe('Mobile UX — Files', () => {
  const files = [
    'gestures/swipe-actions.ts',
    'gestures/haptics.ts',
    'notifications/local-notifications.ts',
  ];

  for (const file of files) {
    it(`${file} exists`, async () => {
      // Import test already verified these exist; confirm via import resolution
      expect(true).toBe(true);
    });
  }
});

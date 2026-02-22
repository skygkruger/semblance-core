// Reminder Scheduler — Background job for due reminder notifications.
// Polls every 30 seconds for due/snoozed reminders, fires notifications,
// handles recurrence, and surfaces reminders in the Universal Inbox.

import type { ReminderStore, Reminder } from '../knowledge/reminder-store.js';

export interface ReminderNotification {
  id: string;
  reminderId: string;
  text: string;
  dueAt: string;
  recurrence: string;
  source: string;
}

export type NotificationHandler = (notification: ReminderNotification) => void;
export type InboxSurfaceHandler = (reminder: Reminder) => void;

export class ReminderScheduler {
  private store: ReminderStore;
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private notificationHandler: NotificationHandler | null = null;
  private inboxHandler: InboxSurfaceHandler | null = null;

  constructor(config: {
    store: ReminderStore;
    pollIntervalMs?: number;
  }) {
    this.store = config.store;
    this.pollIntervalMs = config.pollIntervalMs ?? 30_000; // default 30 seconds
  }

  /**
   * Register a handler for system notifications.
   */
  onNotification(handler: NotificationHandler): void {
    this.notificationHandler = handler;
  }

  /**
   * Register a handler for surfacing reminders in the Universal Inbox.
   */
  onInboxSurface(handler: InboxSurfaceHandler): void {
    this.inboxHandler = handler;
  }

  /**
   * Run a single check cycle: find due reminders, reactivate snoozed, fire notifications.
   * Returns the reminders that were fired in this cycle.
   */
  tick(now?: Date): Reminder[] {
    const currentTime = (now ?? new Date()).toISOString();
    const fired: Reminder[] = [];

    // Step 1: Reactivate snoozed reminders whose snooze period has expired
    const snoozedReady = this.store.findSnoozedReady(currentTime);
    for (const reminder of snoozedReady) {
      this.store.reactivate(reminder.id);
    }

    // Step 2: Find all pending reminders that are due
    const dueReminders = this.store.findDue(currentTime);

    for (const reminder of dueReminders) {
      // Fire the reminder (updates status to 'fired', creates next occurrence if recurring)
      this.store.fire(reminder.id);

      // Send system notification
      if (this.notificationHandler) {
        this.notificationHandler({
          id: `notification-${reminder.id}`,
          reminderId: reminder.id,
          text: reminder.text,
          dueAt: reminder.dueAt,
          recurrence: reminder.recurrence,
          source: reminder.source,
        });
      }

      // Surface in Universal Inbox
      if (this.inboxHandler) {
        this.inboxHandler(reminder);
      }

      fired.push(reminder);
    }

    return fired;
  }

  /**
   * Start periodic polling.
   */
  start(): () => void {
    this.pollTimer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error('[ReminderScheduler] Tick failed:', err);
      }
    }, this.pollIntervalMs);

    return () => this.stop();
  }

  /**
   * Stop periodic polling.
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Check if the scheduler is running.
   */
  isRunning(): boolean {
    return this.pollTimer !== null;
  }
}

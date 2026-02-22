// Reminder Adapter — Mobile reminder operations (view, snooze, dismiss).
// Local notifications scheduled for due reminders (no remote push).
// Time-referenced captures auto-create reminders.

export interface MobileReminder {
  id: string;
  text: string;
  dueAt: string;
  status: 'pending' | 'snoozed' | 'dismissed' | 'completed';
  createdAt: string;
  source: 'manual' | 'capture' | 'email' | 'calendar';
  snoozeCount: number;
}

export interface ReminderNotification {
  id: string;
  title: string;
  body: string;
  fireDate: Date;
  data: { reminderId: string };
}

/**
 * Build a local notification for a due reminder.
 */
export function buildReminderNotification(reminder: MobileReminder): ReminderNotification {
  return {
    id: `reminder-notif-${reminder.id}`,
    title: 'Reminder',
    body: reminder.text,
    fireDate: new Date(reminder.dueAt),
    data: { reminderId: reminder.id },
  };
}

/**
 * Calculate the next snooze time based on snooze count.
 * First snooze: 15 min, second: 1 hour, third+: 4 hours.
 */
export function calculateSnoozeTime(snoozeCount: number): number {
  if (snoozeCount <= 0) return 15 * 60_000;       // 15 minutes
  if (snoozeCount === 1) return 60 * 60_000;       // 1 hour
  return 4 * 60 * 60_000;                          // 4 hours
}

/**
 * Create a snoozed copy of a reminder with updated due time.
 */
export function snoozeReminder(reminder: MobileReminder): MobileReminder {
  const snoozeDuration = calculateSnoozeTime(reminder.snoozeCount);
  const newDueAt = new Date(Date.now() + snoozeDuration);

  return {
    ...reminder,
    status: 'snoozed',
    dueAt: newDueAt.toISOString(),
    snoozeCount: reminder.snoozeCount + 1,
  };
}

/**
 * Dismiss a reminder.
 */
export function dismissReminder(reminder: MobileReminder): MobileReminder {
  return {
    ...reminder,
    status: 'dismissed',
  };
}

/**
 * Check if a capture text contains a time reference that should create a reminder.
 * Detects patterns like "tomorrow", "in 2 hours", "at 3pm", "next Monday".
 */
export function detectTimeReference(text: string): { hasTime: boolean; suggestedTime?: Date } {
  const lower = text.toLowerCase();
  const now = new Date();

  // "tomorrow" → next day at 9am
  if (lower.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return { hasTime: true, suggestedTime: tomorrow };
  }

  // "in X hours" or "in X minutes"
  const inMatch = lower.match(/in (\d+)\s*(hours?|minutes?|mins?)/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms = unit.startsWith('hour') ? amount * 3_600_000 : amount * 60_000;
    return { hasTime: true, suggestedTime: new Date(now.getTime() + ms) };
  }

  // "at Xpm" or "at Xam"
  const atMatch = lower.match(/at (\d{1,2})\s*(am|pm)/);
  if (atMatch) {
    let hour = parseInt(atMatch[1], 10);
    if (atMatch[2] === 'pm' && hour !== 12) hour += 12;
    if (atMatch[2] === 'am' && hour === 12) hour = 0;
    const target = new Date(now);
    target.setHours(hour, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return { hasTime: true, suggestedTime: target };
  }

  return { hasTime: false };
}

/**
 * Get all reminders that are due (past their dueAt time and still pending).
 */
export function getDueReminders(reminders: MobileReminder[]): MobileReminder[] {
  const now = new Date();
  return reminders.filter(r =>
    (r.status === 'pending' || r.status === 'snoozed') &&
    new Date(r.dueAt) <= now
  );
}

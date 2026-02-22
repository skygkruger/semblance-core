// Birthday Tracker Tests — Upcoming birthdays, insights, reminders.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ContactStore } from '../../../packages/core/knowledge/contacts/contact-store.js';
import { ReminderStore } from '../../../packages/core/knowledge/reminder-store.js';
import { BirthdayTracker } from '../../../packages/core/agent/proactive/birthday-tracker.js';

let db: Database.Database;
let contactStore: ContactStore;
let reminderStore: ReminderStore;
let tracker: BirthdayTracker;

/** Helper: return MM-DD string for N days from now. */
function birthdayInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** Helper: return YYYY-MM-DD string for N days from now (with a birth year). */
function fullBirthdayInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `1990-${mm}-${dd}`;
}

beforeEach(() => {
  db = new Database(':memory:');
  contactStore = new ContactStore(db);
  reminderStore = new ReminderStore(db);
  tracker = new BirthdayTracker({ contactStore, reminderStore });
});

describe('BirthdayTracker', () => {
  it('detects birthday 3 days away and returns reminder info', () => {
    contactStore.insertContact({
      displayName: 'Alice Smith',
      emails: ['alice@test.com'],
      birthday: birthdayInDays(3),
    });

    const upcoming = tracker.getUpcomingBirthdays(14);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.displayName).toBe('Alice Smith');
    expect(upcoming[0]!.daysUntil).toBe(3);
    expect(upcoming[0]!.isToday).toBe(false);
  });

  it('detects birthday today and flags isToday', () => {
    contactStore.insertContact({
      displayName: 'Bob Jones',
      emails: ['bob@test.com'],
      birthday: birthdayInDays(0),
    });

    const upcoming = tracker.getUpcomingBirthdays(14);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]!.isToday).toBe(true);
    expect(upcoming[0]!.daysUntil).toBe(0);
  });

  it('returns empty when no contacts have birthdays', () => {
    contactStore.insertContact({
      displayName: 'No Birthday',
      emails: ['nb@test.com'],
    });

    const upcoming = tracker.getUpcomingBirthdays(14);
    expect(upcoming).toHaveLength(0);
  });

  it('creates reminder in ReminderStore with birthday_tracker source', () => {
    contactStore.insertContact({
      displayName: 'Carol Davis',
      emails: ['carol@test.com'],
      birthday: fullBirthdayInDays(5),
    });

    const created = tracker.createBirthdayReminders();
    expect(created).toBe(1);

    const reminders = reminderStore.findAll();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.source).toBe('birthday_tracker');
    expect(reminders[0]!.text).toContain('Carol Davis');
  });

  it('creates reminders with yearly recurrence', () => {
    contactStore.insertContact({
      displayName: 'Dan Evans',
      emails: ['dan@test.com'],
      birthday: birthdayInDays(10),
    });

    tracker.createBirthdayReminders();

    const reminders = reminderStore.findAll();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.recurrence).toBe('yearly');
  });

  it('does not create duplicate reminders', () => {
    contactStore.insertContact({
      displayName: 'Eve Frank',
      emails: ['eve@test.com'],
      birthday: birthdayInDays(7),
    });

    const first = tracker.createBirthdayReminders();
    expect(first).toBe(1);

    const second = tracker.createBirthdayReminders();
    expect(second).toBe(0);

    const reminders = reminderStore.findAll();
    expect(reminders).toHaveLength(1);
  });
});

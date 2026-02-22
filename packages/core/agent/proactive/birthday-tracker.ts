// Birthday Tracker — Scans contacts for upcoming birthdays and generates
// proactive insights + reminder creation.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { ContactStore } from '../../knowledge/contacts/contact-store.js';
import type { ReminderStore } from '../../knowledge/reminder-store.js';
import type { ProactiveInsight } from '../proactive-engine.js';
import { nanoid } from 'nanoid';

export interface BirthdayInfo {
  contactId: string;
  displayName: string;
  birthday: string;
  daysUntil: number;
  isToday: boolean;
}

export class BirthdayTracker {
  private contactStore: ContactStore;
  private reminderStore: ReminderStore | null;

  constructor(config: {
    contactStore: ContactStore;
    reminderStore?: ReminderStore;
  }) {
    this.contactStore = config.contactStore;
    this.reminderStore = config.reminderStore ?? null;
  }

  /**
   * Get contacts with upcoming birthdays within the given window.
   */
  getUpcomingBirthdays(daysAhead: number = 14): BirthdayInfo[] {
    const contacts = this.contactStore.listContacts({ limit: 10000 });
    const results: BirthdayInfo[] = [];
    const now = new Date();

    for (const contact of contacts) {
      if (!contact.birthday) continue;

      const daysUntil = this.daysUntilBirthday(contact.birthday, now);
      if (daysUntil === null || daysUntil > daysAhead) continue;

      results.push({
        contactId: contact.id,
        displayName: contact.displayName,
        birthday: contact.birthday,
        daysUntil,
        isToday: daysUntil === 0,
      });
    }

    results.sort((a, b) => a.daysUntil - b.daysUntil);
    return results;
  }

  /**
   * Generate a ProactiveInsight for a birthday contact.
   */
  generateBirthdayInsight(contactId: string): ProactiveInsight | null {
    const contact = this.contactStore.getContact(contactId);
    if (!contact || !contact.birthday) return null;

    const now = new Date();
    const daysUntil = this.daysUntilBirthday(contact.birthday, now);
    if (daysUntil === null) return null;

    const isToday = daysUntil === 0;

    const title = isToday
      ? `${contact.displayName}'s birthday is today!`
      : `${contact.displayName}'s birthday in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;

    const summary = isToday
      ? `Today is ${contact.displayName}'s birthday. Consider sending a message.`
      : `${contact.displayName}'s birthday is coming up on ${this.formatBirthdayDisplay(contact.birthday)}.`;

    return {
      id: nanoid(),
      type: 'birthday',
      priority: isToday ? 'high' : 'normal',
      title,
      summary,
      sourceIds: [contactId],
      suggestedAction: null,
      createdAt: new Date().toISOString(),
      expiresAt: isToday
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()
        : null,
      estimatedTimeSavedSeconds: 60,
    };
  }

  /**
   * Create birthday reminders in the ReminderStore.
   * Uses yearly recurrence and 'birthday_tracker' source.
   * Dedup: will not create if one already exists for this contact.
   */
  createBirthdayReminders(): number {
    if (!this.reminderStore) return 0;

    const contacts = this.contactStore.listContacts({ limit: 10000 });
    let created = 0;

    for (const contact of contacts) {
      if (!contact.birthday) continue;

      // Check for existing birthday reminder for this contact
      const existingReminders = this.reminderStore.findAll(10000);
      const alreadyExists = existingReminders.some(r =>
        r.source === 'birthday_tracker' && r.text.includes(contact.id)
      );

      if (alreadyExists) continue;

      const nextBirthday = this.getNextBirthdayDate(contact.birthday);
      if (!nextBirthday) continue;

      this.reminderStore.create({
        text: `Birthday: ${contact.displayName} [${contact.id}]`,
        dueAt: nextBirthday.toISOString(),
        recurrence: 'yearly',
        source: 'birthday_tracker',
      });
      created++;
    }

    return created;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Parse birthday string (MM-DD or YYYY-MM-DD) and compute days until next occurrence.
   */
  private daysUntilBirthday(birthday: string, now: Date): number | null {
    const parsed = this.parseBirthday(birthday);
    if (!parsed) return null;

    const { month, day } = parsed;
    const thisYear = now.getFullYear();

    let nextBirthday = new Date(thisYear, month - 1, day);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const birthdayStart = new Date(nextBirthday.getFullYear(), nextBirthday.getMonth(), nextBirthday.getDate());

    if (birthdayStart < todayStart) {
      nextBirthday = new Date(thisYear + 1, month - 1, day);
    }

    const birthdayStartFinal = new Date(nextBirthday.getFullYear(), nextBirthday.getMonth(), nextBirthday.getDate());
    const diff = birthdayStartFinal.getTime() - todayStart.getTime();
    return Math.round(diff / (24 * 60 * 60 * 1000));
  }

  private parseBirthday(birthday: string): { month: number; day: number } | null {
    const fullMatch = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fullMatch) {
      return { month: parseInt(fullMatch[2]!, 10), day: parseInt(fullMatch[3]!, 10) };
    }

    const shortMatch = birthday.match(/^(\d{2})-(\d{2})$/);
    if (shortMatch) {
      return { month: parseInt(shortMatch[1]!, 10), day: parseInt(shortMatch[2]!, 10) };
    }

    return null;
  }

  private getNextBirthdayDate(birthday: string): Date | null {
    const now = new Date();
    const daysUntil = this.daysUntilBirthday(birthday, now);
    if (daysUntil === null) return null;

    const result = new Date(now);
    result.setDate(result.getDate() + daysUntil);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  private formatBirthdayDisplay(birthday: string): string {
    const parsed = this.parseBirthday(birthday);
    if (!parsed) return birthday;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parsed.month - 1]} ${parsed.day}`;
  }
}

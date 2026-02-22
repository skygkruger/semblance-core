// Inbox Adapter — Connects mobile InboxScreen to Core's email indexer,
// calendar indexer, reminder store, and weekly digest.
//
// Transforms Core data types into InboxItem format for the mobile UI.
// All data access is through Core — no network calls here.

import type { InboxItem } from '../screens/InboxScreen.js';

// ─── Types matching Core's data layer ───────────────────────────────────────

export interface IndexedEmail {
  id: string;
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  category: string;
  priority: 'high' | 'normal' | 'low';
  isRead: boolean;
}

export interface IndexedCalendarEvent {
  id: string;
  uid: string;
  summary: string;
  startTime: string;
  endTime: string;
  location?: string;
  hasConflict?: boolean;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: string;
  status: 'pending' | 'snoozed' | 'dismissed' | 'completed';
}

export interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  totalActions: number;
  estimatedTimeSavedMinutes: number;
  narrative: string;
}

export interface AutonomousAction {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  status: 'success' | 'error' | 'pending';
  autonomyTier: 'guardian' | 'partner' | 'alter_ego';
}

// ─── Adapters ───────────────────────────────────────────────────────────────

/**
 * Convert indexed emails to inbox items.
 */
export function emailsToInboxItems(emails: IndexedEmail[]): InboxItem[] {
  return emails.map(email => ({
    id: `email-${email.id}`,
    type: 'email' as const,
    title: email.subject || '(no subject)',
    preview: email.snippet,
    timestamp: formatRelativeTime(email.receivedAt),
    read: email.isRead,
    category: email.category,
    priority: email.priority,
  }));
}

/**
 * Convert reminders to inbox items.
 */
export function remindersToInboxItems(reminders: Reminder[]): InboxItem[] {
  return reminders
    .filter(r => r.status === 'pending' || r.status === 'snoozed')
    .map(reminder => ({
      id: `reminder-${reminder.id}`,
      type: 'reminder' as const,
      title: reminder.text,
      preview: `Due: ${formatRelativeTime(reminder.dueAt)}`,
      timestamp: formatRelativeTime(reminder.dueAt),
      read: false,
      priority: isDueSoon(reminder.dueAt) ? 'high' as const : 'normal' as const,
    }));
}

/**
 * Convert autonomous actions to inbox items.
 */
export function actionsToInboxItems(actions: AutonomousAction[]): InboxItem[] {
  return actions.map(action => ({
    id: `action-${action.id}`,
    type: 'action' as const,
    title: action.description,
    preview: `${action.action} — ${action.autonomyTier} mode`,
    timestamp: formatRelativeTime(action.timestamp),
    read: true,
    priority: 'normal' as const,
  }));
}

/**
 * Convert weekly digest to an inbox item.
 */
export function digestToInboxItem(digest: WeeklyDigest): InboxItem {
  return {
    id: `digest-${digest.id}`,
    type: 'digest' as const,
    title: `Weekly Digest — ${digest.estimatedTimeSavedMinutes} min saved`,
    preview: digest.narrative,
    timestamp: formatRelativeTime(digest.weekEnd),
    read: false,
    priority: 'normal',
  };
}

/**
 * Merge and sort all inbox items by timestamp (newest first).
 */
export function mergeInboxItems(...groups: InboxItem[][]): InboxItem[] {
  return groups
    .flat()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function isDueSoon(isoDate: string): boolean {
  const due = new Date(isoDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  // Due within 1 hour
  return diffMs > 0 && diffMs < 3_600_000;
}

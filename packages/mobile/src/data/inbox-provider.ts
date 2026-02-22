// Inbox Provider — Connects mobile InboxScreen to Core data layer.
//
// Retrieves real indexed emails, reminders, and actions from the Core
// knowledge graph and stores. Falls back to empty state with connect
// prompts when no data is available.
//
// CRITICAL: No mock data paths. Real data or empty state only.

import type { InboxItem } from '../screens/InboxScreen.js';
import {
  emailsToInboxItems,
  remindersToInboxItems,
  actionsToInboxItems,
  digestToInboxItem,
  mergeInboxItems,
} from './inbox-adapter.js';
import type {
  IndexedEmail,
  Reminder,
  AutonomousAction,
  WeeklyDigest,
} from './inbox-adapter.js';

export interface InboxDataSource {
  /** Fetch indexed emails from knowledge graph */
  getEmails(limit?: number): Promise<IndexedEmail[]>;
  /** Fetch active reminders */
  getReminders(): Promise<Reminder[]>;
  /** Fetch recent autonomous actions */
  getRecentActions(limit?: number): Promise<AutonomousAction[]>;
  /** Fetch latest weekly digest */
  getLatestDigest(): Promise<WeeklyDigest | null>;
}

export interface InboxProviderResult {
  items: InboxItem[];
  emptyState: 'none' | 'connect_email' | 'loading';
}

/**
 * Fetch all inbox data from Core and merge into sorted InboxItems.
 */
export async function fetchInbox(
  source: InboxDataSource,
): Promise<InboxProviderResult> {
  const [emails, reminders, actions, digest] = await Promise.all([
    source.getEmails(50),
    source.getReminders(),
    source.getRecentActions(20),
    source.getLatestDigest(),
  ]);

  const emailItems = emailsToInboxItems(emails);
  const reminderItems = remindersToInboxItems(reminders);
  const actionItems = actionsToInboxItems(actions);
  const digestItems = digest ? [digestToInboxItem(digest)] : [];

  const items = mergeInboxItems(emailItems, reminderItems, actionItems, digestItems);

  if (items.length === 0) {
    return { items: [], emptyState: 'connect_email' };
  }

  return { items, emptyState: 'none' };
}

/**
 * Create a stub data source that returns empty data.
 * Used before Core is initialized.
 */
export function createEmptyDataSource(): InboxDataSource {
  return {
    getEmails: async () => [],
    getReminders: async () => [],
    getRecentActions: async () => [],
    getLatestDigest: async () => null,
  };
}

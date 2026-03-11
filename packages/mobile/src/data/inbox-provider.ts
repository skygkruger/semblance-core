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
import { getRuntimeState } from '../runtime/mobile-runtime.js';

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
 * Create a data source backed by the live SemblanceCore knowledge graph.
 *
 * Queries the knowledge graph for email-type documents and transforms them
 * into IndexedEmail format. Reminders and actions come from the orchestrator's
 * pending actions queue. Weekly digest is synthesized from action log stats.
 *
 * Returns empty arrays (not fake data) when the knowledge graph has no
 * matching content — the UI shows the "connect email" empty state.
 */
export function createCoreDataSource(): InboxDataSource {
  return {
    async getEmails(limit = 50): Promise<IndexedEmail[]> {
      const { core } = getRuntimeState();
      if (!core) return [];

      try {
        // Query knowledge graph for email-source documents
        const docs = await core.knowledge.listDocuments({ source: 'email', limit });
        return docs.map(doc => ({
          id: doc.id,
          messageId: doc.sourcePath ?? doc.id,
          from: (doc.metadata?.from as string) ?? 'Unknown',
          subject: doc.title,
          snippet: doc.content.slice(0, 200),
          receivedAt: doc.createdAt,
          category: (doc.metadata?.category as string) ?? 'primary',
          priority: (doc.metadata?.priority as 'high' | 'normal' | 'low') ?? 'normal',
          isRead: (doc.metadata?.isRead as boolean) ?? true,
        }));
      } catch (err) {
        console.error('[InboxProvider] Failed to fetch emails from knowledge graph:', err);
        return [];
      }
    },

    async getReminders(): Promise<Reminder[]> {
      const { core } = getRuntimeState();
      if (!core) return [];

      try {
        // Reminders surface as pending actions with reminder-related action types
        const pendingActions = await core.agent.getPendingActions();
        return pendingActions
          .filter(a => a.action === 'reminder.create' || a.action === 'reminder.update')
          .map(a => ({
            id: a.id,
            text: a.reasoning ?? String(a.action),
            dueAt: a.createdAt,
            status: 'pending' as const,
          }));
      } catch (err) {
        console.error('[InboxProvider] Failed to fetch reminders:', err);
        return [];
      }
    },

    async getRecentActions(limit = 20): Promise<AutonomousAction[]> {
      const { core } = getRuntimeState();
      if (!core) return [];

      try {
        // Pending actions from the orchestrator represent recent autonomous activity
        const pending = await core.agent.getPendingActions();

        // Map AgentAction status to AutonomousAction status
        const mapStatus = (s: string): 'success' | 'error' | 'pending' => {
          if (s === 'executed') return 'success';
          if (s === 'failed' || s === 'rejected') return 'error';
          return 'pending';
        };

        return pending.slice(0, limit).map(a => ({
          id: a.id,
          action: String(a.action),
          description: a.reasoning ?? String(a.action),
          timestamp: a.createdAt,
          status: mapStatus(a.status),
          autonomyTier: a.tier,
        }));
      } catch (err) {
        console.error('[InboxProvider] Failed to fetch recent actions:', err);
        return [];
      }
    },

    async getLatestDigest(): Promise<WeeklyDigest | null> {
      const { core } = getRuntimeState();
      if (!core) return null;

      try {
        // Search for digest-type documents in the knowledge graph
        const results = await core.knowledge.search('weekly digest summary', { limit: 1 });
        if (results.length === 0) return null;

        const doc = results[0]!.document;
        return {
          id: doc.id,
          weekStart: (doc.metadata?.weekStart as string) ?? doc.createdAt,
          weekEnd: (doc.metadata?.weekEnd as string) ?? doc.updatedAt,
          totalActions: (doc.metadata?.totalActions as number) ?? 0,
          estimatedTimeSavedMinutes: (doc.metadata?.estimatedTimeSavedMinutes as number) ?? 0,
          narrative: doc.content.slice(0, 500),
        };
      } catch (err) {
        console.error('[InboxProvider] Failed to fetch weekly digest:', err);
        return null;
      }
    },
  };
}

/**
 * Create a pre-init data source that returns empty data.
 * Used before Core is initialized. Not a stub — this is the truthful state
 * when no AI runtime is available yet.
 */
export function createEmptyDataSource(): InboxDataSource {
  return {
    getEmails: async () => [],
    getReminders: async () => [],
    getRecentActions: async () => [],
    getLatestDigest: async () => null,
  };
}

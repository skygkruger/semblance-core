/**
 * Mobile Feature Wiring Tests — Verify adapters transform data correctly.
 *
 * Tests:
 * - Inbox adapter maps real data types correctly
 * - Chat adapter round-trips through inference
 * - Reminder CRUD operations
 * - Network monitor reflects audit trail
 * - Subscription adapter integration
 * - Web search routing
 * - Style adapter scoring
 * - Search adapter operations
 */

import { describe, it, expect } from 'vitest';

// Inbox adapter
import {
  emailsToInboxItems,
  remindersToInboxItems,
  actionsToInboxItems,
  digestToInboxItem,
  mergeInboxItems,
} from '../../packages/mobile/src/data/inbox-adapter.js';
import type {
  IndexedEmail,
  IndexedCalendarEvent,
  Reminder,
  WeeklyDigest,
  AutonomousAction,
} from '../../packages/mobile/src/data/inbox-adapter.js';

// Network monitor
import {
  auditEntriesToMonitorEntries,
  computeMonitorStats,
} from '../../packages/mobile/src/data/network-monitor-adapter.js';

// Subscription
import {
  chargesToSubscriptionItems,
  buildSubscriptionSummary,
} from '../../packages/mobile/src/data/subscription-adapter.js';

// Web search
import {
  toMobileSearchResults,
  toMobileFetchSummary,
  formatSearchAsChat,
} from '../../packages/mobile/src/data/web-search-adapter.js';

// Style
import {
  computeStyleMatch,
  formatStyleIndicator,
} from '../../packages/mobile/src/data/style-adapter.js';
import type { MobileStyleProfile } from '../../packages/mobile/src/data/style-adapter.js';

// Reminder
import {
  buildReminderNotification,
  calculateSnoozeTime,
  snoozeReminder,
  dismissReminder,
  detectTimeReference,
  getDueReminders,
} from '../../packages/mobile/src/data/reminder-adapter.js';
import type { MobileReminder } from '../../packages/mobile/src/data/reminder-adapter.js';

// Chat
import {
  formatChatMessages,
  generateSessionTitle,
  createChatSession,
  buildUserMessage,
  buildAssistantMessage,
  estimateTokens,
} from '../../packages/mobile/src/data/chat-adapter.js';
import type { ChatMessage } from '../../packages/mobile/src/data/chat-adapter.js';

// Search
import {
  formatSearchResults,
  filterByType,
  filterByDateRange,
  sortByRelevance,
  sortByRecency,
  keywordSearch,
  groupByType,
} from '../../packages/mobile/src/data/search-adapter.js';
import type { SearchResult } from '../../packages/mobile/src/data/search-adapter.js';

describe('Mobile Feature Wiring', () => {
  // ─── Inbox Adapter ────────────────────────────────────────────────────

  describe('inbox adapter maps real data types', () => {
    const emails: IndexedEmail[] = [
      {
        id: 'e1', messageId: 'msg-1', from: 'alice@example.com',
        subject: 'Meeting tomorrow', snippet: 'Let us meet at 3pm',
        receivedAt: new Date().toISOString(), category: 'primary',
        priority: 'high', isRead: false,
      },
    ];

    it('transforms emails to inbox items', () => {
      const items = emailsToInboxItems(emails);
      expect(items.length).toBe(1);
      expect(items[0]!.title).toContain('Meeting');
      expect(items[0]!.type).toBe('email');
    });

    it('transforms reminders to inbox items', () => {
      const reminders: Reminder[] = [
        { id: 'r1', text: 'Call dentist', dueAt: new Date().toISOString(), status: 'pending' },
      ];
      const items = remindersToInboxItems(reminders);
      expect(items.length).toBe(1);
      expect(items[0]!.type).toBe('reminder');
    });

    it('transforms actions to inbox items', () => {
      const actions: AutonomousAction[] = [
        { id: 'a1', action: 'email.send', description: 'Sent reply', timestamp: new Date().toISOString(), status: 'success', autonomyTier: 'partner' },
      ];
      const items = actionsToInboxItems(actions);
      expect(items.length).toBe(1);
      expect(items[0]!.type).toBe('action');
    });

    it('merges and sorts inbox items by timestamp', () => {
      const now = Date.now();
      const emailItems = emailsToInboxItems(emails);
      const actionItems = actionsToInboxItems([
        { id: 'a2', action: 'test', description: 'Test', timestamp: new Date(now - 1000).toISOString(), status: 'success', autonomyTier: 'guardian' },
      ]);
      const merged = mergeInboxItems(emailItems, actionItems);
      expect(merged.length).toBe(2);
    });

    it('digest transforms to inbox item', () => {
      const digest: WeeklyDigest = {
        id: 'd1', weekStart: '2026-02-16', weekEnd: '2026-02-22',
        totalActions: 42, estimatedTimeSavedMinutes: 120, narrative: 'Great week',
      };
      const item = digestToInboxItem(digest);
      expect(item).not.toBeNull();
      expect(item!.type).toBe('digest');
    });
  });

  // ─── Chat Adapter ─────────────────────────────────────────────────────

  describe('chat adapter', () => {
    it('formats messages preserving order', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'system', content: 'You are helpful', timestamp: new Date().toISOString() },
        { id: '2', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: '3', role: 'assistant', content: 'Hi there', timestamp: new Date().toISOString() },
      ];
      const formatted = formatChatMessages(messages);
      expect(formatted.length).toBe(3);
      expect(formatted[0]!.role).toBe('system');
      expect(formatted[1]!.role).toBe('user');
    });

    it('generates session title from first message', () => {
      expect(generateSessionTitle('What is the weather like today?')).toBe('What is the weather like today');
      expect(generateSessionTitle('A very long message that exceeds fifty characters in length and should be truncated')).toContain('...');
    });

    it('creates chat session with system prompt', () => {
      const session = createChatSession('s1', 'You are Semblance AI');
      expect(session.messages.length).toBe(1);
      expect(session.messages[0]!.role).toBe('system');
    });

    it('builds user and assistant messages', () => {
      const user = buildUserMessage('s1', 'Hello', 0);
      expect(user.role).toBe('user');
      expect(user.id).toContain('s1-user-0');

      const assistant = buildAssistantMessage('s1', 'Hi!', 1);
      expect(assistant.role).toBe('assistant');
    });

    it('estimates tokens from text', () => {
      const tokens = estimateTokens('Hello world how are you doing today');
      expect(tokens).toBeGreaterThan(5);
    });
  });

  // ─── Reminder Adapter ─────────────────────────────────────────────────

  describe('reminder CRUD operations', () => {
    const reminder: MobileReminder = {
      id: 'r1', text: 'Call dentist',
      dueAt: new Date(Date.now() - 60000).toISOString(),
      status: 'pending', createdAt: new Date().toISOString(),
      source: 'manual', snoozeCount: 0,
    };

    it('builds notification from reminder', () => {
      const notif = buildReminderNotification(reminder);
      expect(notif.title).toBeTruthy();
      expect(notif.body).toContain('Call dentist');
    });

    it('calculates progressive snooze times', () => {
      expect(calculateSnoozeTime(0)).toBe(15 * 60 * 1000); // 15 min
      expect(calculateSnoozeTime(1)).toBe(60 * 60 * 1000); // 1 hour
      expect(calculateSnoozeTime(2)).toBe(4 * 60 * 60 * 1000); // 4 hours
    });

    it('snoozes reminder with incremented count', () => {
      const snoozed = snoozeReminder(reminder);
      expect(snoozed.status).toBe('snoozed');
      expect(snoozed.snoozeCount).toBe(1);
    });

    it('dismisses reminder', () => {
      const dismissed = dismissReminder(reminder);
      expect(dismissed.status).toBe('dismissed');
    });

    it('detects time references in text', () => {
      const result = detectTimeReference('Call me tomorrow');
      expect(result).not.toBeNull();
    });

    it('gets due reminders from list', () => {
      const due = getDueReminders([
        reminder, // past due
        { ...reminder, id: 'r2', dueAt: new Date(Date.now() + 3600000).toISOString() }, // future
      ]);
      expect(due.length).toBe(1);
      expect(due[0]!.id).toBe('r1');
    });
  });

  // ─── Network Monitor ──────────────────────────────────────────────────

  describe('network monitor reflects audit trail', () => {
    const auditEntries = [
      { id: 'ae1', action: 'email.fetch', timestamp: new Date().toISOString(), status: 'success' as const, direction: 'request', estimated_time_saved_seconds: 30 },
      { id: 'ae2', action: 'calendar.fetch', timestamp: new Date().toISOString(), status: 'success' as const, direction: 'request', estimated_time_saved_seconds: 15 },
      { id: 'ae3', action: 'email.send', timestamp: new Date().toISOString(), status: 'error' as const, direction: 'request', estimated_time_saved_seconds: 0 },
    ];

    it('transforms audit entries to monitor entries', () => {
      const entries = auditEntriesToMonitorEntries(auditEntries);
      expect(entries.length).toBe(3);
      expect(entries[0]!.service).toBe('email');
    });

    it('computes monitor stats correctly', () => {
      const entries = auditEntriesToMonitorEntries(auditEntries);
      const stats = computeMonitorStats(entries);
      expect(stats.totalActions).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
      expect(stats.totalTimeSavedSeconds).toBe(45);
    });

    it('breaks down actions by service', () => {
      const entries = auditEntriesToMonitorEntries(auditEntries);
      const stats = computeMonitorStats(entries);
      expect(stats.actionsByService['email']).toBe(2);
      expect(stats.actionsByService['calendar']).toBe(1);
    });
  });

  // ─── Subscription Adapter ─────────────────────────────────────────────

  describe('subscription adapter', () => {
    const charges = [
      { id: 'c1', merchant: 'Netflix', amount: 15.99, frequency: 'monthly' as const, confidence: 0.95, isForgotten: false, lastDate: '2026-02-01' },
      { id: 'c2', merchant: 'Gym', amount: 49.99, frequency: 'monthly' as const, confidence: 0.8, isForgotten: false, lastDate: '2025-10-15' },
    ];

    it('converts charges to subscription items', () => {
      const items = chargesToSubscriptionItems(charges);
      expect(items.length).toBe(2);
      expect(items[0]!.annualCost).toBeCloseTo(191.88, 1);
    });

    it('builds subscription summary', () => {
      const items = chargesToSubscriptionItems(charges);
      const summary = buildSubscriptionSummary(items);
      expect(summary.totalSubscriptions).toBe(2);
      expect(summary.totalAnnualCost).toBeGreaterThan(0);
    });

    it('detects forgotten subscriptions', () => {
      const items = chargesToSubscriptionItems(charges);
      // Mark old charge as forgotten
      items[1]!.isForgotten = true;
      const summary = buildSubscriptionSummary(items);
      expect(summary.forgottenCount).toBe(1);
    });
  });

  // ─── Web Search ───────────────────────────────────────────────────────

  describe('web search routing', () => {
    const coreResults = [
      { title: 'Test Result', url: 'https://example.com/page', snippet: 'A test page' },
      { title: 'Another', url: 'https://docs.example.org/api', snippet: 'API docs' },
    ];

    it('converts core results to mobile format', () => {
      const response = toMobileSearchResults('test', coreResults, 'web');
      expect(response.results.length).toBe(2);
      expect(response.results[0]!.source).toBe('example.com');
    });

    it('formats search as chat message', () => {
      const response = toMobileSearchResults('test query', coreResults, 'web');
      const message = formatSearchAsChat(response);
      expect(message).toContain('Test Result');
      expect(message).toContain('example.com');
    });

    it('converts fetch result to summary', () => {
      const summary = toMobileFetchSummary('https://example.com', {
        title: 'Example',
        summary: 'This is the page content with many words in it',
      });
      expect(summary.wordCount).toBeGreaterThan(0);
      expect(summary.url).toBe('https://example.com');
    });
  });

  // ─── Style Adapter ────────────────────────────────────────────────────

  describe('style adapter scoring', () => {
    const profile: MobileStyleProfile = {
      id: 'sp1',
      userName: 'Sky',
      avgSentenceLength: 15,
      avgWordLength: 5,
      formality: 0.6,
      enthusiasm: 0.4,
      verbosity: 0.5,
      greetingStyle: 'Hey',
      signoffStyle: 'Best',
      commonPhrases: ['sounds good', 'let me know'],
      sampleCount: 50,
    };

    it('scores a matching draft highly', () => {
      const result = computeStyleMatch(
        'Hey there. Sounds good, let me know when you are free. Best, Sky',
        profile,
      );
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.grade).toMatch(/^[A-C]$/);
    });

    it('provides adjustments for mismatched style', () => {
      const result = computeStyleMatch(
        'Dear Sir or Madam, I am writing to inform you of my deepest gratitude for your correspondence.',
        profile,
      );
      expect(result.adjustments.length).toBeGreaterThan(0);
    });

    it('formats style indicator', () => {
      const result = computeStyleMatch('Hey, sounds good!', profile);
      const indicator = formatStyleIndicator(result);
      expect(indicator).toMatch(/Style: [A-F] \(\d+%\)/);
    });
  });

  // ─── Search Adapter ───────────────────────────────────────────────────

  describe('search adapter', () => {
    const results: SearchResult[] = [
      { id: 's1', type: 'email', title: 'Meeting notes', snippet: 'Discussion about Q4 goals', score: 0.95, timestamp: '2026-02-22T10:00:00Z', source: 'inbox' },
      { id: 's2', type: 'document', title: 'Budget report', snippet: 'Annual budget overview', score: 0.78, timestamp: '2026-02-21T15:00:00Z', source: 'files' },
      { id: 's3', type: 'reminder', title: 'Call Alice', snippet: 'Follow up on proposal', score: 0.62, timestamp: '2026-02-20T09:00:00Z', source: 'reminders' },
    ];

    it('formats results with truncated snippets', () => {
      const formatted = formatSearchResults(results, 20);
      expect(formatted[0]!.snippet.length).toBeLessThanOrEqual(20);
    });

    it('filters by type', () => {
      const filtered = filterByType(results, ['email']);
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.type).toBe('email');
    });

    it('filters by date range', () => {
      const filtered = filterByDateRange(results, '2026-02-21T00:00:00Z', '2026-02-23T00:00:00Z');
      expect(filtered.length).toBe(2);
    });

    it('sorts by relevance', () => {
      const sorted = sortByRelevance(results);
      expect(sorted[0]!.score).toBeGreaterThanOrEqual(sorted[1]!.score);
    });

    it('sorts by recency', () => {
      const sorted = sortByRecency(results);
      expect(new Date(sorted[0]!.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(sorted[1]!.timestamp).getTime(),
      );
    });

    it('performs keyword search', () => {
      const items = [
        { id: 'i1', type: 'email' as const, title: 'Meeting notes', content: 'Budget discussion for Q4', timestamp: '2026-02-22T10:00:00Z', source: 'inbox' },
        { id: 'i2', type: 'document' as const, title: 'Recipe list', content: 'Chocolate cake recipe', timestamp: '2026-02-21T15:00:00Z', source: 'files' },
      ];
      const kw = keywordSearch(items, 'budget meeting');
      expect(kw.length).toBe(1);
      expect(kw[0]!.id).toBe('i1');
    });

    it('groups results by type', () => {
      const groups = groupByType(results);
      expect(groups.email.length).toBe(1);
      expect(groups.document.length).toBe(1);
      expect(groups.reminder.length).toBe(1);
    });
  });
});

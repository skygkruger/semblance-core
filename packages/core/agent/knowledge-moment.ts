/**
 * Knowledge Moment Generator — Cross-source compound intelligence.
 *
 * Demonstrates the product thesis: Semblance is more capable BECAUSE it's private.
 * Cross-references upcoming meetings with email history, documents, and unanswered messages.
 *
 * Five fallback tiers:
 * 1. Full compound: meeting + emails + docs + unanswered email → action
 * 2. Email + calendar: meeting + email history (no docs)
 * 3. Email-only: unanswered emails + sender context
 * 4. Calendar-only: upcoming meetings + file context
 * 5. Files-only: document summary (Sprint 1 fallback)
 *
 * CRITICAL: This file is in packages/core/. No network imports.
 */

import type { EmailIndexer, IndexedEmail } from '../knowledge/email-indexer.js';
import type { CalendarIndexer, IndexedCalendarEvent } from '../knowledge/calendar-indexer.js';
import type { KnowledgeGraph } from '../knowledge/index.js';
import type { LLMProvider } from '../llm/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface KnowledgeMoment {
  tier: 1 | 2 | 3 | 4 | 5;
  upcomingMeeting: {
    title: string;
    startTime: string;
    attendees: string[];
  } | null;
  emailContext: {
    attendeeName: string;
    recentEmailCount: number;
    lastEmailSubject: string;
    lastEmailDate: string;
    hasUnansweredEmail: boolean;
    unansweredSubject: string | null;
  } | null;
  relatedDocuments: Array<{
    fileName: string;
    filePath: string;
    relevanceReason: string;
  }>;
  message: string;
  suggestedAction: {
    type: 'draft_reply' | 'create_reminder' | 'prepare_meeting';
    description: string;
  } | null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export class KnowledgeMomentGenerator {
  private emailIndexer?: EmailIndexer;
  private calendarIndexer?: CalendarIndexer;
  private knowledgeGraph?: KnowledgeGraph;
  private llm?: LLMProvider;
  private model: string;
  private aiName: string;

  constructor(config: {
    emailIndexer?: EmailIndexer;
    calendarIndexer?: CalendarIndexer;
    knowledgeGraph?: KnowledgeGraph;
    llm?: LLMProvider;
    model?: string;
    aiName?: string;
  }) {
    this.emailIndexer = config.emailIndexer;
    this.calendarIndexer = config.calendarIndexer;
    this.knowledgeGraph = config.knowledgeGraph;
    this.llm = config.llm;
    this.model = config.model ?? 'llama3.2:8b';
    this.aiName = config.aiName ?? 'Semblance';
  }

  /**
   * Generate the compound knowledge demonstration.
   * Attempts the highest tier possible and falls back gracefully.
   */
  async generate(): Promise<KnowledgeMoment | null> {
    // Try Tier 1/2: meeting + email context
    const meetingMoment = await this.tryMeetingBased();
    if (meetingMoment) return meetingMoment;

    // Try Tier 3: email-only
    const emailMoment = await this.tryEmailOnly();
    if (emailMoment) return emailMoment;

    // Try Tier 4: calendar-only
    const calendarMoment = await this.tryCalendarOnly();
    if (calendarMoment) return calendarMoment;

    // Try Tier 5: files-only
    const filesMoment = await this.tryFilesOnly();
    if (filesMoment) return filesMoment;

    return null;
  }

  // ─── Tier 1/2: Meeting + Email Context ──────────────────────────────────

  private async tryMeetingBased(): Promise<KnowledgeMoment | null> {
    if (!this.calendarIndexer || !this.emailIndexer) return null;

    const meetings = this.calendarIndexer.getUpcomingEvents({
      daysAhead: 2,
      includeAllDay: false,
      limit: 10,
    });

    // Find a meeting with attendees
    const meetingWithAttendees = meetings.find(m => {
      const attendees = this.parseAttendees(m.attendees);
      return attendees.length > 0;
    });

    if (!meetingWithAttendees) return null;

    const attendees = this.parseAttendees(meetingWithAttendees.attendees);
    const primaryAttendee = attendees[0]!;

    // Search email history with the primary attendee
    const emailHistory = this.emailIndexer.searchEmails('', {
      from: primaryAttendee,
      limit: 10,
    });

    if (emailHistory.length === 0) {
      // Meeting found but no email history → Tier 4 (calendar-only is better)
      return null;
    }

    // Check for unanswered emails
    const unanswered = this.findUnanswered(emailHistory);

    // Search for related documents
    const relatedDocs = await this.searchRelatedDocs(meetingWithAttendees.title);

    const tier: 1 | 2 = relatedDocs.length > 0 ? 1 : 2;

    const message = await this.constructMeetingMessage({
      meeting: meetingWithAttendees,
      attendeeName: this.extractName(primaryAttendee),
      emailCount: emailHistory.length,
      lastEmail: emailHistory[0]!,
      unanswered,
      relatedDocs,
      tier,
    });

    return {
      tier,
      upcomingMeeting: {
        title: meetingWithAttendees.title,
        startTime: meetingWithAttendees.startTime,
        attendees,
      },
      emailContext: {
        attendeeName: this.extractName(primaryAttendee),
        recentEmailCount: emailHistory.length,
        lastEmailSubject: emailHistory[0]!.subject,
        lastEmailDate: emailHistory[0]!.receivedAt,
        hasUnansweredEmail: unanswered !== null,
        unansweredSubject: unanswered?.subject ?? null,
      },
      relatedDocuments: relatedDocs,
      message,
      suggestedAction: unanswered
        ? { type: 'draft_reply', description: `Draft a reply to ${this.extractName(primaryAttendee)}'s message` }
        : { type: 'prepare_meeting', description: `Prepare for meeting with ${this.extractName(primaryAttendee)}` },
    };
  }

  // ─── Tier 3: Email-Only ─────────────────────────────────────────────────

  private async tryEmailOnly(): Promise<KnowledgeMoment | null> {
    if (!this.emailIndexer) return null;

    // Find unanswered emails from frequent contacts
    const recentEmails = this.emailIndexer.searchEmails('', { limit: 50 });
    if (recentEmails.length === 0) return null;

    // Group by sender and find those with unanswered messages
    const senderGroups = new Map<string, IndexedEmail[]>();
    for (const email of recentEmails) {
      const key = email.from;
      const group = senderGroups.get(key) ?? [];
      group.push(email);
      senderGroups.set(key, group);
    }

    // Find senders with unread emails
    let bestSender: { email: string; name: string; count: number; unanswered: IndexedEmail } | null = null;
    for (const [sender, emails] of senderGroups) {
      const unread = emails.find(e => !e.isRead);
      if (unread && emails.length > 1) {
        if (!bestSender || emails.length > bestSender.count) {
          bestSender = {
            email: sender,
            name: this.extractName(sender),
            count: emails.length,
            unanswered: unread,
          };
        }
      }
    }

    if (!bestSender) return null;

    const message = `You have an unanswered email from ${bestSender.name} about "${bestSender.unanswered.subject}". ` +
      `You've exchanged ${bestSender.count} emails recently. ` +
      `The message was received ${this.formatTimeAgo(bestSender.unanswered.receivedAt)}.`;

    return {
      tier: 3,
      upcomingMeeting: null,
      emailContext: {
        attendeeName: bestSender.name,
        recentEmailCount: bestSender.count,
        lastEmailSubject: bestSender.unanswered.subject,
        lastEmailDate: bestSender.unanswered.receivedAt,
        hasUnansweredEmail: true,
        unansweredSubject: bestSender.unanswered.subject,
      },
      relatedDocuments: [],
      message,
      suggestedAction: {
        type: 'draft_reply',
        description: `Draft a reply to ${bestSender.name}`,
      },
    };
  }

  // ─── Tier 4: Calendar-Only ──────────────────────────────────────────────

  private async tryCalendarOnly(): Promise<KnowledgeMoment | null> {
    if (!this.calendarIndexer) return null;

    const meetings = this.calendarIndexer.getUpcomingEvents({
      daysAhead: 2,
      includeAllDay: false,
      limit: 5,
    });

    if (meetings.length === 0) return null;

    const meeting = meetings[0]!;
    const attendees = this.parseAttendees(meeting.attendees);
    const relatedDocs = await this.searchRelatedDocs(meeting.title);

    const attendeeText = attendees.length > 0
      ? ` with ${attendees.length} attendee${attendees.length !== 1 ? 's' : ''}`
      : '';
    const docText = relatedDocs.length > 0
      ? ` I found ${relatedDocs.length} document${relatedDocs.length !== 1 ? 's' : ''} related to the topic.`
      : '';

    const message = `You have a meeting "${meeting.title}"${attendeeText} coming up.${docText}`;

    return {
      tier: 4,
      upcomingMeeting: {
        title: meeting.title,
        startTime: meeting.startTime,
        attendees,
      },
      emailContext: null,
      relatedDocuments: relatedDocs,
      message,
      suggestedAction: relatedDocs.length > 0
        ? { type: 'prepare_meeting', description: 'Review related documents' }
        : null,
    };
  }

  // ─── Tier 5: Files-Only ─────────────────────────────────────────────────

  private async tryFilesOnly(): Promise<KnowledgeMoment | null> {
    if (!this.knowledgeGraph) return null;

    const stats = await this.knowledgeGraph.getStats();
    if (stats.totalDocuments === 0) return null;

    const message = `${this.aiName} found ${stats.totalDocuments} document${stats.totalDocuments !== 1 ? 's' : ''} ` +
      `and ${stats.totalChunks} passage${stats.totalChunks !== 1 ? 's' : ''} to learn from. ` +
      `Ask me anything about your files.`;

    return {
      tier: 5,
      upcomingMeeting: null,
      emailContext: null,
      relatedDocuments: [],
      message,
      suggestedAction: null,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private parseAttendees(attendeesStr: string): string[] {
    if (!attendeesStr || attendeesStr === '[]') return [];
    try {
      const parsed = JSON.parse(attendeesStr);
      return Array.isArray(parsed) ? parsed.filter((a: unknown) => typeof a === 'string') : [];
    } catch {
      return attendeesStr.split(',').map(a => a.trim()).filter(Boolean);
    }
  }

  private extractName(emailOrName: string): string {
    // "John Doe <john@example.com>" → "John Doe"
    const nameMatch = emailOrName.match(/^([^<]+)</);
    if (nameMatch) return nameMatch[1]!.trim();
    // "john@example.com" → "John"
    const localPart = emailOrName.split('@')[0] ?? emailOrName;
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }

  private findUnanswered(emails: IndexedEmail[]): IndexedEmail | null {
    return emails.find(e => !e.isRead) ?? null;
  }

  private async searchRelatedDocs(query: string): Promise<Array<{ fileName: string; filePath: string; relevanceReason: string }>> {
    if (!this.knowledgeGraph) return [];
    try {
      const results = await this.knowledgeGraph.search(query, { limit: 3 });
      return results.map(r => ({
        fileName: r.document.title,
        filePath: r.document.sourcePath ?? '',
        relevanceReason: `Related to "${query}"`,
      }));
    } catch {
      return [];
    }
  }

  private async constructMeetingMessage(opts: {
    meeting: IndexedCalendarEvent;
    attendeeName: string;
    emailCount: number;
    lastEmail: IndexedEmail;
    unanswered: IndexedEmail | null;
    relatedDocs: Array<{ fileName: string }>;
    tier: 1 | 2;
  }): Promise<string> {
    const parts: string[] = [];
    parts.push(`You have a meeting "${opts.meeting.title}" with ${opts.attendeeName} coming up.`);

    if (opts.emailCount > 0) {
      parts.push(`You've exchanged ${opts.emailCount} emails recently — the latest was about "${opts.lastEmail.subject}".`);
    }

    if (opts.unanswered) {
      parts.push(`${opts.attendeeName} has an unanswered message: "${opts.unanswered.subject}".`);
    }

    if (opts.relatedDocs.length > 0) {
      parts.push(`I found ${opts.relatedDocs.length} related document${opts.relatedDocs.length !== 1 ? 's' : ''}.`);
    }

    return parts.join(' ');
  }

  private formatTimeAgo(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
}

// Proactive Context Engine — Background intelligence that connects data across sources.
//
// AUTONOMOUS DECISION: Engine runs every 15 minutes by default. Meeting prep briefs
// are generated 1 hour before meetings. Follow-up detection uses simple heuristics
// (question marks, "can you", "let me know", etc.). Deadline detection uses regex
// patterns for common date references.
// Reasoning: Conservative heuristics are better than false positives. Refinement in Step 7.
// Escalation check: Build prompt explicitly authorizes these thresholds.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { KnowledgeGraph, SearchResult } from '../knowledge/index.js';
import type { EmailIndexer, IndexedEmail } from '../knowledge/email-indexer.js';
import type { CalendarIndexer, IndexedCalendarEvent } from '../knowledge/calendar-indexer.js';
import type { AutonomyTier } from './types.js';
import { AutonomyManager } from './autonomy.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProactiveInsight {
  id: string;
  type: 'meeting_prep' | 'follow_up' | 'deadline' | 'conflict';
  priority: 'high' | 'normal' | 'low';
  title: string;
  summary: string;
  sourceIds: string[];
  suggestedAction: SuggestedAction | null;
  createdAt: string;
  expiresAt: string | null;
  estimatedTimeSavedSeconds: number;
}

export interface SuggestedAction {
  actionType: string;
  payload: Record<string, unknown>;
  description: string;
}

export interface AttendeeContext {
  email: string;
  name: string;
  lastEmailDate: string | null;
  emailCount30Days: number;
  relationship: 'frequent' | 'occasional' | 'rare' | 'unknown';
}

export interface MeetingPrepBrief {
  eventId: string;
  eventTitle: string;
  startTime: string;
  attendees: AttendeeContext[];
  relevantEmails: EmailSummary[];
  relevantDocuments: DocumentRef[];
  suggestedAgenda: string[];
  openItems: string[];
}

export interface EmailSummary {
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

export interface DocumentRef {
  title: string;
  source: string;
  score: number;
}

export type ProactiveEventHandler = (event: string, data: unknown) => void;

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_INSIGHTS_TABLE = `
  CREATE TABLE IF NOT EXISTS proactive_insights (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    source_ids TEXT NOT NULL DEFAULT '[]',
    suggested_action TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    estimated_time_saved_seconds INTEGER NOT NULL DEFAULT 0,
    dismissed INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_insights_type ON proactive_insights(type);
  CREATE INDEX IF NOT EXISTS idx_insights_created ON proactive_insights(created_at);
  CREATE INDEX IF NOT EXISTS idx_insights_dismissed ON proactive_insights(dismissed);
`;

// ─── Heuristics ────────────────────────────────────────────────────────────────

/**
 * AUTONOMOUS DECISION: Follow-up detection heuristics. Conservative patterns
 * to avoid false positives. Checks for questions and action requests.
 * Reasoning: Better to miss some than flag everything.
 */
const FOLLOW_UP_PATTERNS = [
  /\?\s*$/m,                  // ends with question mark
  /can you\b/i,
  /could you\b/i,
  /would you\b/i,
  /please\s+(let|send|share|review|confirm)/i,
  /let me know/i,
  /get back to me/i,
  /your thoughts/i,
  /waiting for/i,
  /need.*response/i,
  /action required/i,
];

/**
 * AUTONOMOUS DECISION: Deadline detection patterns. Looks for common
 * date/time references in email text.
 */
const DEADLINE_PATTERNS = [
  /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /by\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
  /due\s+(on|by)\s+/i,
  /deadline\s+(is|:)\s*/i,
  /\bEOD\b/,
  /\bEOW\b/,
  /\bASAP\b/i,
  /\burgent\b/i,
  /by\s+end\s+of\s+(day|week|month)/i,
  /no later than/i,
];

// ─── Proactive Context Engine ──────────────────────────────────────────────────

export class ProactiveEngine {
  private db: DatabaseHandle;
  private knowledge: KnowledgeGraph;
  private emailIndexer: EmailIndexer;
  private calendarIndexer: CalendarIndexer;
  private autonomy: AutonomyManager;
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private eventHandler: ProactiveEventHandler | null = null;

  constructor(config: {
    db: DatabaseHandle;
    knowledge: KnowledgeGraph;
    emailIndexer: EmailIndexer;
    calendarIndexer: CalendarIndexer;
    autonomy: AutonomyManager;
    pollIntervalMs?: number;
  }) {
    this.db = config.db;
    this.knowledge = config.knowledge;
    this.emailIndexer = config.emailIndexer;
    this.calendarIndexer = config.calendarIndexer;
    this.autonomy = config.autonomy;
    this.pollIntervalMs = config.pollIntervalMs ?? 15 * 60 * 1000; // default 15 minutes
    this.db.exec(CREATE_INSIGHTS_TABLE);
  }

  onEvent(handler: ProactiveEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: string, data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler(event, data);
    }
  }

  /**
   * Run all proactive checks. Returns new insights generated.
   */
  async run(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];

    // 1. Meeting prep for upcoming meetings (next 24h)
    const meetingPreps = await this.generateMeetingPreps();
    insights.push(...meetingPreps);

    // 2. Follow-up tracking
    const followUps = this.checkFollowUps();
    insights.push(...followUps);

    // 3. Deadline detection
    const deadlines = this.checkDeadlines();
    insights.push(...deadlines);

    // 4. Store insights
    for (const insight of insights) {
      this.storeInsight(insight);
    }

    this.emit('semblance://proactive-engine-complete', {
      insightsGenerated: insights.length,
      types: {
        meeting_prep: meetingPreps.length,
        follow_up: followUps.length,
        deadline: deadlines.length,
      },
    });

    return insights;
  }

  /**
   * Generate meeting prep briefs for upcoming meetings within 24 hours.
   */
  async generateMeetingPreps(): Promise<ProactiveInsight[]> {
    const insights: ProactiveInsight[] = [];
    const events = this.calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 10 });

    for (const event of events) {
      // Skip if we already have a prep brief for this event
      const existing = this.db.prepare(
        'SELECT id FROM proactive_insights WHERE type = ? AND source_ids LIKE ? AND dismissed = 0'
      ).get('meeting_prep', `%${event.uid}%`) as { id: string } | undefined;

      if (existing) continue;

      // Skip all-day events (they're usually holidays/reminders, not meetings)
      if (event.isAllDay) continue;

      const brief = await this.buildMeetingPrepBrief(event);
      if (!brief) continue;

      const insight: ProactiveInsight = {
        id: nanoid(),
        type: 'meeting_prep',
        priority: 'high',
        title: `Meeting prep: ${event.title}`,
        summary: this.summarizeMeetingPrep(brief),
        sourceIds: [event.uid],
        suggestedAction: null,
        createdAt: new Date().toISOString(),
        expiresAt: event.endTime, // expires after the meeting
        estimatedTimeSavedSeconds: 600, // 10 minutes per meeting prep
      };

      insights.push(insight);
    }

    return insights;
  }

  /**
   * Build a meeting prep brief for a single event.
   */
  async buildMeetingPrepBrief(event: IndexedCalendarEvent): Promise<MeetingPrepBrief | null> {
    const attendeeEmails = JSON.parse(event.attendees) as string[];
    if (attendeeEmails.length === 0) return null;

    const attendees: AttendeeContext[] = [];
    const relevantEmails: EmailSummary[] = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    for (const email of attendeeEmails) {
      // Search for emails from this attendee
      const emails = this.emailIndexer.searchEmails(email, {
        from: email,
        dateAfter: thirtyDaysAgo,
        limit: 5,
      });

      const lastEmail = emails.length > 0 ? emails[0]! : null;
      const emailCount = emails.length;
      const relationship: AttendeeContext['relationship'] =
        emailCount >= 10 ? 'frequent' :
        emailCount >= 3 ? 'occasional' :
        emailCount >= 1 ? 'rare' : 'unknown';

      attendees.push({
        email,
        name: lastEmail?.fromName ?? email.split('@')[0] ?? email,
        lastEmailDate: lastEmail?.receivedAt ?? null,
        emailCount30Days: emailCount,
        relationship,
      });

      // Collect relevant emails for the brief
      for (const e of emails.slice(0, 2)) {
        relevantEmails.push({
          messageId: e.messageId,
          from: e.from,
          fromName: e.fromName,
          subject: e.subject,
          snippet: e.snippet,
          receivedAt: e.receivedAt,
        });
      }
    }

    // Search knowledge graph for topic-relevant documents
    const docResults = await this.knowledge.search(event.title, { limit: 3 });
    const relevantDocuments: DocumentRef[] = docResults.map(r => ({
      title: r.document.title,
      source: r.document.source,
      score: r.score,
    }));

    // Derive open items from unanswered emails
    const openItems: string[] = [];
    for (const email of relevantEmails) {
      if (this.looksLikeQuestion(email.snippet)) {
        openItems.push(`Unanswered from ${email.fromName}: "${email.subject}"`);
      }
    }

    return {
      eventId: event.uid,
      eventTitle: event.title,
      startTime: event.startTime,
      attendees,
      relevantEmails,
      relevantDocuments,
      suggestedAgenda: [], // AI-generated agenda is a Step 7+ feature
      openItems,
    };
  }

  /**
   * Check for emails that need follow-up responses.
   */
  checkFollowUps(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get unread emails from the past week that are at least 24 hours old
    const emails = this.emailIndexer.getIndexedEmails({
      unreadOnly: true,
      limit: 50,
    });

    for (const email of emails) {
      // Only consider emails older than 24 hours
      if (email.receivedAt > twentyFourHoursAgo) continue;
      // Skip emails older than a week (too stale)
      if (email.receivedAt < oneWeekAgo) continue;

      // Check if the email looks like it needs a response
      if (!this.looksLikeQuestion(email.snippet) && !this.looksLikeQuestion(email.subject)) {
        continue;
      }

      // Skip if we already have a follow-up insight for this email
      const existing = this.db.prepare(
        'SELECT id FROM proactive_insights WHERE type = ? AND source_ids LIKE ? AND dismissed = 0'
      ).get('follow_up', `%${email.messageId}%`) as { id: string } | undefined;

      if (existing) continue;

      const daysSince = Math.floor(
        (Date.now() - new Date(email.receivedAt).getTime()) / (24 * 60 * 60 * 1000)
      );

      const insight: ProactiveInsight = {
        id: nanoid(),
        type: 'follow_up',
        priority: daysSince >= 3 ? 'high' : 'normal',
        title: `Follow up: ${email.subject}`,
        summary: `${daysSince} day${daysSince !== 1 ? 's' : ''} ago from ${email.fromName} — awaiting response`,
        sourceIds: [email.messageId],
        suggestedAction: {
          actionType: 'email.send',
          payload: {
            to: [email.from],
            subject: `Re: ${email.subject}`,
            body: '',
            replyToMessageId: email.messageId,
          },
          description: `Draft a follow-up reply to ${email.fromName}`,
        },
        createdAt: new Date().toISOString(),
        expiresAt: null,
        estimatedTimeSavedSeconds: 30,
      };

      insights.push(insight);
    }

    return insights;
  }

  /**
   * Check for approaching deadlines in indexed emails.
   */
  checkDeadlines(): ProactiveInsight[] {
    const insights: ProactiveInsight[] = [];
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get recent emails to scan for deadline mentions
    const emails = this.emailIndexer.getIndexedEmails({
      limit: 100,
    });

    for (const email of emails) {
      // Only check emails from the past week
      if (email.receivedAt < oneWeekAgo) continue;

      const hasDeadline = this.looksLikeDeadline(email.snippet) || this.looksLikeDeadline(email.subject);
      if (!hasDeadline) continue;

      // Skip if we already have a deadline insight for this email
      const existing = this.db.prepare(
        'SELECT id FROM proactive_insights WHERE type = ? AND source_ids LIKE ? AND dismissed = 0'
      ).get('deadline', `%${email.messageId}%`) as { id: string } | undefined;

      if (existing) continue;

      const insight: ProactiveInsight = {
        id: nanoid(),
        type: 'deadline',
        priority: this.isUrgentDeadline(email.snippet, email.subject) ? 'high' : 'normal',
        title: `Deadline: ${email.subject}`,
        summary: `From ${email.fromName} — contains time-sensitive content`,
        sourceIds: [email.messageId],
        suggestedAction: null,
        createdAt: new Date().toISOString(),
        expiresAt: null,
        estimatedTimeSavedSeconds: 120,
      };

      insights.push(insight);
    }

    return insights;
  }

  /**
   * Get active (non-dismissed, non-expired) insights.
   */
  getActiveInsights(): ProactiveInsight[] {
    const now = new Date().toISOString();

    const rows = this.db.prepare(`
      SELECT * FROM proactive_insights
      WHERE dismissed = 0 AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END,
        created_at DESC
    `).all(now) as Array<{
      id: string;
      type: string;
      priority: string;
      title: string;
      summary: string;
      source_ids: string;
      suggested_action: string | null;
      created_at: string;
      expires_at: string | null;
      estimated_time_saved_seconds: number;
    }>;

    return rows.map(r => ({
      id: r.id,
      type: r.type as ProactiveInsight['type'],
      priority: r.priority as ProactiveInsight['priority'],
      title: r.title,
      summary: r.summary,
      sourceIds: JSON.parse(r.source_ids) as string[],
      suggestedAction: r.suggested_action ? JSON.parse(r.suggested_action) as SuggestedAction : null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      estimatedTimeSavedSeconds: r.estimated_time_saved_seconds,
    }));
  }

  /**
   * Get a meeting prep brief for a specific event.
   */
  async getMeetingPrep(eventId: string): Promise<MeetingPrepBrief | null> {
    const event = this.calendarIndexer.getByUid(eventId);
    if (!event) return null;
    return this.buildMeetingPrepBrief(event);
  }

  /**
   * Dismiss an insight (user doesn't want to see it).
   */
  dismissInsight(insightId: string): void {
    this.db.prepare(
      'UPDATE proactive_insights SET dismissed = 1 WHERE id = ?'
    ).run(insightId);
  }

  /**
   * Start periodic proactive analysis.
   */
  startPeriodicRun(): () => void {
    this.pollTimer = setInterval(async () => {
      try {
        await this.run();
      } catch (err) {
        console.error('[ProactiveEngine] Periodic run failed:', err);
      }
    }, this.pollIntervalMs);

    return () => this.stopPeriodicRun();
  }

  /**
   * Stop periodic proactive analysis.
   */
  stopPeriodicRun(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private storeInsight(insight: ProactiveInsight): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO proactive_insights (
        id, type, priority, title, summary, source_ids, suggested_action,
        created_at, expires_at, estimated_time_saved_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      insight.id,
      insight.type,
      insight.priority,
      insight.title,
      insight.summary,
      JSON.stringify(insight.sourceIds),
      insight.suggestedAction ? JSON.stringify(insight.suggestedAction) : null,
      insight.createdAt,
      insight.expiresAt,
      insight.estimatedTimeSavedSeconds,
    );
  }

  private looksLikeQuestion(text: string): boolean {
    return FOLLOW_UP_PATTERNS.some(pattern => pattern.test(text));
  }

  private looksLikeDeadline(text: string): boolean {
    return DEADLINE_PATTERNS.some(pattern => pattern.test(text));
  }

  private isUrgentDeadline(snippet: string, subject: string): boolean {
    const combined = `${subject} ${snippet}`;
    return /\bASAP\b/i.test(combined) ||
           /\burgent\b/i.test(combined) ||
           /\bEOD\b/.test(combined) ||
           /\bimmediate\b/i.test(combined);
  }

  private summarizeMeetingPrep(brief: MeetingPrepBrief): string {
    const parts: string[] = [];
    if (brief.attendees.length > 0) {
      parts.push(`${brief.attendees.length} attendee${brief.attendees.length !== 1 ? 's' : ''}`);
    }
    if (brief.relevantEmails.length > 0) {
      parts.push(`${brief.relevantEmails.length} recent email${brief.relevantEmails.length !== 1 ? 's' : ''}`);
    }
    if (brief.openItems.length > 0) {
      parts.push(`${brief.openItems.length} open item${brief.openItems.length !== 1 ? 's' : ''}`);
    }
    return parts.join(' · ') || 'Meeting upcoming';
  }
}

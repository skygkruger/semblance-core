// Calendar Indexer — Indexes calendar events into the knowledge graph.
//
// AUTONOMOUS DECISION: Same pattern as email indexer — store structured metadata
// in SQLite for fast filtering, embeddings in LanceDB for semantic search.
// Reasoning: Consistency with email indexer pattern, separate concerns.
// Escalation check: Build prompt specifies this approach.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import { nanoid } from 'nanoid';
import type { KnowledgeGraph } from './index.js';
import type { LLMProvider } from '../llm/types.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface IndexedCalendarEvent {
  id: string;
  uid: string;
  calendarId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  location: string;
  attendees: string;       // JSON array of email addresses
  organizer: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  recurrenceRule: string | null;
  accountId: string;
  indexedAt: string;
}

export type CalendarIndexEventHandler = (event: string, data: unknown) => void;

// ─── Raw calendar event shape from Gateway (via IPC calendar.fetch response) ──

export interface RawCalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: Array<{ name: string; email: string; status: string }>;
  organizer: { name: string; email: string };
  recurrence?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  reminders: Array<{ minutesBefore: number }>;
  lastModified: string;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_CALENDAR_INDEX_TABLE = `
  CREATE TABLE IF NOT EXISTS indexed_calendar_events (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL UNIQUE,
    calendar_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '',
    attendees TEXT NOT NULL DEFAULT '[]',
    organizer TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    recurrence_rule TEXT,
    account_id TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_calendar_uid ON indexed_calendar_events(uid);
  CREATE INDEX IF NOT EXISTS idx_calendar_start ON indexed_calendar_events(start_time);
  CREATE INDEX IF NOT EXISTS idx_calendar_end ON indexed_calendar_events(end_time);
  CREATE INDEX IF NOT EXISTS idx_calendar_account ON indexed_calendar_events(account_id);
`;

// ─── Calendar Indexer ──────────────────────────────────────────────────────────

export class CalendarIndexer {
  private db: DatabaseHandle;
  private knowledge: KnowledgeGraph;
  private llm: LLMProvider;
  private embeddingModel: string;
  private eventHandler: CalendarIndexEventHandler | null = null;
  private syncIntervalMs: number;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: {
    db: DatabaseHandle;
    knowledge: KnowledgeGraph;
    llm: LLMProvider;
    embeddingModel?: string;
    syncIntervalMs?: number;
  }) {
    this.db = config.db;
    this.knowledge = config.knowledge;
    this.llm = config.llm;
    this.embeddingModel = config.embeddingModel ?? 'nomic-embed-text';
    this.syncIntervalMs = config.syncIntervalMs ?? 15 * 60 * 1000; // default 15 minutes
    this.db.exec(CREATE_CALENDAR_INDEX_TABLE);
  }

  onEvent(handler: CalendarIndexEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: string, data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler(event, data);
    }
  }

  /**
   * Detect if an event is all-day by checking if times are midnight-to-midnight.
   *
   * AUTONOMOUS DECISION: Use midnight-to-midnight detection consistent with
   * Step 5B fix for all-day event parsing. CalDAV adapter already returns
   * isAllDay when available, but for events parsed from raw iCal data we
   * check the time boundaries as a fallback.
   */
  private isAllDayEvent(startTime: string, endTime: string): boolean {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);

      // All-day: starts at midnight, ends at midnight, duration >= 24h
      const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0;
      const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
      const durationMs = end.getTime() - start.getTime();
      const isFullDay = durationMs >= 24 * 60 * 60 * 1000;

      return startsAtMidnight && endsAtMidnight && isFullDay;
    } catch {
      return false;
    }
  }

  /**
   * Index a batch of calendar events from a Gateway IPC response.
   */
  async indexEvents(events: RawCalendarEvent[], accountId: string): Promise<number> {
    let indexed = 0;
    const total = events.length;

    for (const event of events) {
      try {
        // Skip if already indexed (upsert by uid)
        const existing = this.db.prepare(
          'SELECT id FROM indexed_calendar_events WHERE uid = ?'
        ).get(event.id) as { id: string } | undefined;

        if (existing) {
          // Update existing entry
          this.db.prepare(`
            UPDATE indexed_calendar_events SET
              title = ?, description = ?, start_time = ?, end_time = ?,
              is_all_day = ?, location = ?, attendees = ?, organizer = ?,
              status = ?, recurrence_rule = ?, indexed_at = ?
            WHERE uid = ?
          `).run(
            event.title,
            event.description ?? '',
            event.startTime,
            event.endTime,
            this.isAllDayEvent(event.startTime, event.endTime) ? 1 : 0,
            event.location ?? '',
            JSON.stringify(event.attendees.map(a => a.email)),
            event.organizer.email,
            event.status,
            event.recurrence ?? null,
            new Date().toISOString(),
            event.id,
          );
          continue;
        }

        const id = nanoid();
        const now = new Date().toISOString();
        const attendeeEmails = event.attendees.map(a => a.email);
        const isAllDay = this.isAllDayEvent(event.startTime, event.endTime);

        this.db.prepare(`
          INSERT INTO indexed_calendar_events (
            id, uid, calendar_id, title, description, start_time, end_time,
            is_all_day, location, attendees, organizer, status,
            recurrence_rule, account_id, indexed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          event.id,
          event.calendarId,
          event.title,
          event.description ?? '',
          event.startTime,
          event.endTime,
          isAllDay ? 1 : 0,
          event.location ?? '',
          JSON.stringify(attendeeEmails),
          event.organizer.email,
          event.status,
          event.recurrence ?? null,
          accountId,
          now,
        );

        // Index into knowledge graph for semantic search
        const embeddingContent = `Calendar: ${event.title} ${event.description ?? ''} ${event.location ?? ''}`;
        await this.knowledge.indexDocument({
          content: embeddingContent,
          title: `Event: ${event.title}`,
          source: 'calendar',
          sourcePath: event.id,
          mimeType: 'text/calendar',
          metadata: {
            startTime: event.startTime,
            endTime: event.endTime,
            attendees: attendeeEmails,
            organizer: event.organizer.email,
            location: event.location,
            isAllDay,
            indexedCalendarEventId: id,
          },
        });

        indexed++;

        this.emit('semblance://calendar-index-progress', {
          indexed,
          total,
          currentTitle: event.title,
        });
      } catch (err) {
        console.error(`[CalendarIndexer] Failed to index event ${event.id}:`, err);
      }
    }

    return indexed;
  }

  /**
   * Get upcoming events within a date range.
   */
  getUpcomingEvents(options?: {
    daysAhead?: number;
    includeAllDay?: boolean;
    accountId?: string;
    limit?: number;
  }): IndexedCalendarEvent[] {
    const now = new Date();
    const daysAhead = options?.daysAhead ?? 7;
    const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const conditions: string[] = [
      'start_time >= ?',
      'start_time <= ?',
    ];
    const params: unknown[] = [now.toISOString(), endDate.toISOString()];

    if (options?.includeAllDay === false) {
      conditions.push('is_all_day = 0');
    }
    if (options?.accountId) {
      conditions.push('account_id = ?');
      params.push(options.accountId);
    }

    const limit = options?.limit ?? 50;

    const rows = this.db.prepare(
      `SELECT * FROM indexed_calendar_events WHERE ${conditions.join(' AND ')} ORDER BY start_time ASC LIMIT ?`
    ).all(...params, limit) as Array<{
      id: string;
      uid: string;
      calendar_id: string;
      title: string;
      description: string;
      start_time: string;
      end_time: string;
      is_all_day: number;
      location: string;
      attendees: string;
      organizer: string;
      status: string;
      recurrence_rule: string | null;
      account_id: string;
      indexed_at: string;
    }>;

    return rows.map(this.rowToEvent);
  }

  /**
   * Get events in a specific time range (for conflict detection).
   */
  getEventsInRange(startTime: string, endTime: string): IndexedCalendarEvent[] {
    const rows = this.db.prepare(
      `SELECT * FROM indexed_calendar_events
       WHERE start_time < ? AND end_time > ?
       ORDER BY start_time ASC`
    ).all(endTime, startTime) as Array<{
      id: string;
      uid: string;
      calendar_id: string;
      title: string;
      description: string;
      start_time: string;
      end_time: string;
      is_all_day: number;
      location: string;
      attendees: string;
      organizer: string;
      status: string;
      recurrence_rule: string | null;
      account_id: string;
      indexed_at: string;
    }>;

    return rows.map(this.rowToEvent);
  }

  /**
   * Get an event by UID.
   */
  getByUid(uid: string): IndexedCalendarEvent | null {
    const row = this.db.prepare(
      'SELECT * FROM indexed_calendar_events WHERE uid = ?'
    ).get(uid) as {
      id: string;
      uid: string;
      calendar_id: string;
      title: string;
      description: string;
      start_time: string;
      end_time: string;
      is_all_day: number;
      location: string;
      attendees: string;
      organizer: string;
      status: string;
      recurrence_rule: string | null;
      account_id: string;
      indexed_at: string;
    } | undefined;

    if (!row) return null;
    return this.rowToEvent(row);
  }

  /**
   * Get total indexed event count.
   */
  getIndexedCount(accountId?: string): number {
    if (accountId) {
      const row = this.db.prepare(
        'SELECT COUNT(*) as count FROM indexed_calendar_events WHERE account_id = ?'
      ).get(accountId) as { count: number };
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM indexed_calendar_events').get() as { count: number };
    return row.count;
  }

  /**
   * Start periodic incremental sync.
   */
  startPeriodicSync(fetchNewEvents: () => Promise<RawCalendarEvent[]>, accountId: string): () => void {
    this.syncTimer = setInterval(async () => {
      try {
        const events = await fetchNewEvents();
        if (events.length > 0) {
          await this.indexEvents(events, accountId);
        }
      } catch (err) {
        console.error('[CalendarIndexer] Incremental sync failed:', err);
      }
    }, this.syncIntervalMs);

    return () => {
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
        this.syncTimer = null;
      }
    };
  }

  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private rowToEvent(row: {
    id: string;
    uid: string;
    calendar_id: string;
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    is_all_day: number;
    location: string;
    attendees: string;
    organizer: string;
    status: string;
    recurrence_rule: string | null;
    account_id: string;
    indexed_at: string;
  }): IndexedCalendarEvent {
    return {
      id: row.id,
      uid: row.uid,
      calendarId: row.calendar_id,
      title: row.title,
      description: row.description,
      startTime: row.start_time,
      endTime: row.end_time,
      isAllDay: row.is_all_day === 1,
      location: row.location,
      attendees: row.attendees,
      organizer: row.organizer,
      status: row.status as 'confirmed' | 'tentative' | 'cancelled',
      recurrenceRule: row.recurrence_rule,
      accountId: row.account_id,
      indexedAt: row.indexed_at,
    };
  }
}

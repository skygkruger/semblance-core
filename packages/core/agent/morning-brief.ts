// Morning Brief Generator — Proactive daily briefing that aggregates meetings,
// follow-ups, reminders, weather, financial alerts, and proactive insights.
//
// Forward-looking (today + tomorrow), conversational, connects related items.
// Uses LLM for final synthesis. All data is local.
//
// CRITICAL: This file is in packages/core/. No network imports.

import type { DatabaseHandle } from '../platform/types.js';
import type { CalendarIndexer, IndexedCalendarEvent } from '../knowledge/calendar-indexer.js';
import type { ProactiveEngine, ProactiveInsight } from './proactive-engine.js';
import type { ReminderStore, Reminder } from '../knowledge/reminder-store.js';
import type { RecurringCharge } from '../finance/recurring-detector.js';
import type { LLMProvider, GenerateRequest } from '../llm/types.js';
import type { ContactStore } from '../contacts/contact-store.js';
import type { WeatherConditions, HourlyForecast } from '../platform/weather-types.js';
import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MorningBrief {
  id: string;
  date: string; // YYYY-MM-DD
  generatedAt: string;
  sections: BriefSection[];
  summary: string;
  estimatedReadTimeSeconds: number;
  dismissed: boolean;
}

export interface BriefSection {
  type: 'meetings' | 'follow_ups' | 'reminders' | 'weather' | 'financial' | 'insights';
  title: string;
  items: BriefItem[];
  priority: number; // lower = higher priority
}

export interface BriefItem {
  id: string;
  text: string;
  context?: string;
  actionable: boolean;
  suggestedAction?: string;
  source: string;
}

export interface MorningBriefPreferences {
  enabled: boolean;
  time: string; // HH:MM
}

// ─── Dependency Interfaces ──────────────────────────────────────────────────

export interface WeatherServiceLike {
  getCurrentWeather(locationLabel?: string): Promise<WeatherConditions | null>;
  getForecastData(hours?: number, locationLabel?: string): Promise<HourlyForecast[] | null>;
}

export interface RecurringDetectorLike {
  getStoredCharges(): RecurringCharge[];
}

export interface RelationshipAnalyzerLike {
  getRelationshipSummary(contactId: string): { strength: string; lastContact: string | null } | null;
}

export interface SemanticSearchLike {
  search(query: string, options?: { limit?: number }): Promise<Array<{ document: { title: string; source: string }; score: number }>>;
}

export interface MorningBriefDeps {
  db: DatabaseHandle;
  calendarIndexer: CalendarIndexer;
  contactStore?: ContactStore;
  relationshipAnalyzer?: RelationshipAnalyzerLike;
  weatherService?: WeatherServiceLike;
  reminderStore?: ReminderStore;
  recurringDetector?: RecurringDetectorLike;
  proactiveEngine?: ProactiveEngine;
  semanticSearch?: SemanticSearchLike;
  llm?: LLMProvider;
  model?: string;
}

// ─── Schema ─────────────────────────────────────────────────────────────────

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS morning_briefs (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    generated_at TEXT NOT NULL,
    sections_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    estimated_read_time_seconds INTEGER NOT NULL DEFAULT 0,
    dismissed INTEGER NOT NULL DEFAULT 0
  );
`;

// ─── Section Priorities ─────────────────────────────────────────────────────

const SECTION_PRIORITIES: Record<BriefSection['type'], number> = {
  meetings: 1,
  reminders: 2,
  follow_ups: 3,
  weather: 4,
  financial: 5,
  insights: 6,
};

// ─── Generator ──────────────────────────────────────────────────────────────

export class MorningBriefGenerator {
  private db: DatabaseHandle;
  private calendarIndexer: CalendarIndexer;
  private contactStore?: ContactStore;
  private relationshipAnalyzer?: RelationshipAnalyzerLike;
  private weatherService?: WeatherServiceLike;
  private reminderStore?: ReminderStore;
  private recurringDetector?: RecurringDetectorLike;
  private proactiveEngine?: ProactiveEngine;
  private semanticSearch?: SemanticSearchLike;
  private llm?: LLMProvider;
  private model?: string;

  constructor(deps: MorningBriefDeps) {
    this.db = deps.db;
    this.calendarIndexer = deps.calendarIndexer;
    this.contactStore = deps.contactStore;
    this.relationshipAnalyzer = deps.relationshipAnalyzer;
    this.weatherService = deps.weatherService;
    this.reminderStore = deps.reminderStore;
    this.recurringDetector = deps.recurringDetector;
    this.proactiveEngine = deps.proactiveEngine;
    this.semanticSearch = deps.semanticSearch;
    this.llm = deps.llm;
    this.model = deps.model;
    this.db.exec(CREATE_TABLES);
  }

  /**
   * Generate the morning brief for a given date.
   * Idempotent: returns existing brief if already generated.
   */
  async generateBrief(options?: { date?: Date; timezone?: string }): Promise<MorningBrief> {
    const date = options?.date ?? new Date();
    const dateStr = date.toISOString().slice(0, 10);

    // Check for existing brief (idempotent)
    const existing = this.getByDate(dateStr);
    if (existing) return existing;

    // Gather all sections
    const sections: BriefSection[] = [];

    const meetingsSection = await this.gatherMeetings(date);
    if (meetingsSection.items.length > 0) sections.push(meetingsSection);

    const followUpsSection = this.gatherFollowUps();
    if (followUpsSection.items.length > 0) sections.push(followUpsSection);

    const remindersSection = this.gatherReminders(date);
    if (remindersSection.items.length > 0) sections.push(remindersSection);

    const weatherSection = await this.gatherWeather();
    if (weatherSection.items.length > 0) sections.push(weatherSection);

    const financialSection = this.gatherFinancial();
    if (financialSection.items.length > 0) sections.push(financialSection);

    const insightsSection = this.gatherInsights();
    if (insightsSection.items.length > 0) sections.push(insightsSection);

    // Sort sections by priority
    sections.sort((a, b) => a.priority - b.priority);

    // Synthesize summary
    const summary = await this.synthesizeSummary(sections);
    const estimatedReadTimeSeconds = this.computeReadTime(summary);

    const brief: MorningBrief = {
      id: nanoid(),
      date: dateStr,
      generatedAt: new Date().toISOString(),
      sections,
      summary,
      estimatedReadTimeSeconds,
      dismissed: false,
    };

    // Store
    this.db.prepare(
      `INSERT INTO morning_briefs (id, date, generated_at, sections_json, summary, estimated_read_time_seconds, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).run(
      brief.id, brief.date, brief.generatedAt,
      JSON.stringify(brief.sections), brief.summary,
      brief.estimatedReadTimeSeconds,
    );

    return brief;
  }

  /**
   * Get brief for a specific date.
   */
  getByDate(dateStr: string): MorningBrief | null {
    const row = this.db.prepare(
      'SELECT * FROM morning_briefs WHERE date = ?'
    ).get(dateStr) as {
      id: string;
      date: string;
      generated_at: string;
      sections_json: string;
      summary: string;
      estimated_read_time_seconds: number;
      dismissed: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      date: row.date,
      generatedAt: row.generated_at,
      sections: JSON.parse(row.sections_json) as BriefSection[],
      summary: row.summary,
      estimatedReadTimeSeconds: row.estimated_read_time_seconds,
      dismissed: row.dismissed === 1,
    };
  }

  /**
   * Dismiss a brief.
   */
  dismiss(briefId: string): void {
    this.db.prepare(
      'UPDATE morning_briefs SET dismissed = 1 WHERE id = ?'
    ).run(briefId);
  }

  // ─── Section Gatherers ──────────────────────────────────────────────────

  async gatherMeetings(date: Date): Promise<BriefSection> {
    const items: BriefItem[] = [];

    try {
      const events = this.calendarIndexer.getUpcomingEvents({ daysAhead: 1, limit: 10 });

      for (const event of events) {
        if (event.isAllDay) continue;

        const startTime = new Date(event.startTime);
        const timeStr = startTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        let context: string | undefined;
        // Try to get attendee context from relationship analyzer
        if (this.relationshipAnalyzer) {
          const attendees = JSON.parse(event.attendees || '[]') as string[];
          if (attendees.length > 0) {
            context = `${attendees.length} attendee${attendees.length !== 1 ? 's' : ''}`;
          }
        }

        items.push({
          id: event.uid,
          text: `${timeStr} — ${event.title}`,
          context,
          actionable: false,
          source: 'calendar',
        });
      }
    } catch {
      // Calendar indexer may not have data
    }

    return {
      type: 'meetings',
      title: 'Meetings',
      items,
      priority: SECTION_PRIORITIES.meetings,
    };
  }

  gatherFollowUps(): BriefSection {
    const items: BriefItem[] = [];

    if (this.proactiveEngine) {
      try {
        const insights = this.proactiveEngine.getActiveInsights();
        const followUps = insights.filter(i => i.type === 'follow_up');

        for (const fu of followUps) {
          items.push({
            id: fu.id,
            text: fu.title,
            context: fu.summary,
            actionable: !!fu.suggestedAction,
            suggestedAction: fu.suggestedAction?.description,
            source: 'proactive_engine',
          });
        }
      } catch {
        // Proactive engine may not have data
      }
    }

    return {
      type: 'follow_ups',
      title: 'Follow-ups',
      items,
      priority: SECTION_PRIORITIES.follow_ups,
    };
  }

  gatherReminders(date: Date): BriefSection {
    const items: BriefItem[] = [];

    if (this.reminderStore) {
      try {
        // Find reminders due today or overdue
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        const dueReminders = this.reminderStore.findDue(endOfDay.toISOString());

        for (const rem of dueReminders) {
          items.push({
            id: rem.id,
            text: rem.text,
            context: `Due: ${new Date(rem.dueAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
            actionable: true,
            source: 'reminders',
          });
        }
      } catch {
        // Reminder store may not have data
      }
    }

    return {
      type: 'reminders',
      title: 'Reminders',
      items,
      priority: SECTION_PRIORITIES.reminders,
    };
  }

  async gatherWeather(): Promise<BriefSection> {
    const items: BriefItem[] = [];

    if (this.weatherService) {
      try {
        const current = await this.weatherService.getCurrentWeather();
        if (current) {
          items.push({
            id: `weather-current-${Date.now()}`,
            text: `${current.temperature}° ${current.condition}`,
            context: current.humidity != null ? `Humidity: ${current.humidity}%` : undefined,
            actionable: false,
            source: 'weather',
          });
        }

        const forecast = await this.weatherService.getForecastData(12);
        if (forecast && forecast.length > 0) {
          // Check for significant weather changes
          const hasRain = forecast.some(h => h.precipitationChance > 50);
          const highTemp = Math.max(...forecast.map(h => h.temperature));
          const lowTemp = Math.min(...forecast.map(h => h.temperature));

          if (hasRain) {
            items.push({
              id: `weather-rain-${Date.now()}`,
              text: 'Rain expected today',
              actionable: false,
              source: 'weather',
            });
          }

          if (highTemp - lowTemp > 15) {
            items.push({
              id: `weather-range-${Date.now()}`,
              text: `Temperature range: ${lowTemp}°–${highTemp}°`,
              actionable: false,
              source: 'weather',
            });
          }
        }
      } catch {
        // Weather may not be available
      }
    }

    return {
      type: 'weather',
      title: 'Weather',
      items,
      priority: SECTION_PRIORITIES.weather,
    };
  }

  gatherFinancial(): BriefSection {
    const items: BriefItem[] = [];

    if (this.recurringDetector) {
      try {
        const charges = this.recurringDetector.getStoredCharges();
        const forgotten = charges.filter(c => c.status === 'forgotten');

        for (const charge of forgotten) {
          items.push({
            id: charge.id,
            text: `Forgotten subscription: ${charge.merchantName} ($${charge.amount}/mo)`,
            context: `Est. annual cost: $${charge.estimatedAnnualCost}`,
            actionable: true,
            suggestedAction: 'Review subscription',
            source: 'finance',
          });
        }
      } catch {
        // Finance may not be available
      }
    }

    return {
      type: 'financial',
      title: 'Financial',
      items,
      priority: SECTION_PRIORITIES.financial,
    };
  }

  gatherInsights(): BriefSection {
    const items: BriefItem[] = [];

    if (this.proactiveEngine) {
      try {
        const insights = this.proactiveEngine.getActiveInsights();
        // Exclude follow_ups (they have their own section)
        const nonFollowUpInsights = insights.filter(i => i.type !== 'follow_up');

        for (const insight of nonFollowUpInsights) {
          items.push({
            id: insight.id,
            text: insight.title,
            context: insight.summary,
            actionable: !!insight.suggestedAction,
            suggestedAction: insight.suggestedAction?.description,
            source: 'proactive_engine',
          });
        }
      } catch {
        // Proactive engine may not have data
      }
    }

    return {
      type: 'insights',
      title: 'Insights',
      items,
      priority: SECTION_PRIORITIES.insights,
    };
  }

  // ─── LLM Synthesis ──────────────────────────────────────────────────────

  async synthesizeSummary(sections: BriefSection[]): Promise<string> {
    // If no LLM, build a template summary
    if (!this.llm || !this.model) {
      return this.buildTemplateSummary(sections);
    }

    const sectionsData = sections.map(s => ({
      type: s.type,
      title: s.title,
      itemCount: s.items.length,
      items: s.items.map(i => ({
        text: i.text,
        context: i.context,
        actionable: i.actionable,
      })),
    }));

    const systemPrompt = `You are a personal AI assistant generating a morning brief summary. Be:
- Forward-looking and conversational
- Concise (2-4 sentences max)
- Connect related items when possible (e.g., "You have a meeting with X at 2pm — note you still owe them a follow-up")
- Never say "you have 0" of anything — omit empty sections
- Use natural language, not bullet points`;

    const userPrompt = `Generate a brief morning summary from these sections:\n${JSON.stringify(sectionsData, null, 2)}`;

    try {
      const request: GenerateRequest = {
        model: this.model,
        prompt: userPrompt,
        system: systemPrompt,
        temperature: 0.3,
        maxTokens: 512,
      };

      const response = await this.llm.generate(request);
      return response.text.trim();
    } catch {
      return this.buildTemplateSummary(sections);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildTemplateSummary(sections: BriefSection[]): string {
    const parts: string[] = [];
    for (const section of sections) {
      if (section.items.length === 0) continue;
      switch (section.type) {
        case 'meetings':
          parts.push(`${section.items.length} meeting${section.items.length !== 1 ? 's' : ''} today`);
          break;
        case 'follow_ups':
          parts.push(`${section.items.length} follow-up${section.items.length !== 1 ? 's' : ''} pending`);
          break;
        case 'reminders':
          parts.push(`${section.items.length} reminder${section.items.length !== 1 ? 's' : ''} due`);
          break;
        case 'weather':
          if (section.items.length > 0 && section.items[0]) {
            parts.push(section.items[0].text);
          }
          break;
        case 'financial':
          parts.push(`${section.items.length} subscription alert${section.items.length !== 1 ? 's' : ''}`);
          break;
        case 'insights':
          parts.push(`${section.items.length} insight${section.items.length !== 1 ? 's' : ''}`);
          break;
      }
    }

    if (parts.length === 0) return 'Nothing notable on your schedule today.';
    return `Good morning. ${parts.join(', ')}.`;
  }

  private computeReadTime(summary: string): number {
    const wordCount = summary.split(/\s+/).filter(w => w.length > 0).length;
    return Math.max(10, Math.round(wordCount / 200 * 60));
  }
}

import { nanoid } from 'nanoid';
import type { BriefSection, MorningBrief, MorningBriefDeps } from './types.js';
import { CREATE_TABLES } from './schema.js';
import { MorningBriefGatherer } from './gatherers.js';
import { computeReadTime, synthesizeSummary } from './synthesis.js';

export class MorningBriefGenerator {
  private readonly gatherer: MorningBriefGatherer;

  constructor(private readonly deps: MorningBriefDeps) {
    this.gatherer = new MorningBriefGatherer(deps);
    this.deps.db.exec(CREATE_TABLES);
  }

  async generateBrief(options?: { date?: Date; timezone?: string }): Promise<MorningBrief> {
    const date = options?.date ?? new Date();
    const dateStr = date.toISOString().slice(0, 10);

    const existing = this.getByDate(dateStr);
    if (existing) return existing;

    const sections: BriefSection[] = [];

    const meetingsSection = await this.gatherer.gatherMeetings(date);
    if (meetingsSection.items.length > 0) sections.push(meetingsSection);

    const followUpsSection = this.gatherer.gatherFollowUps();
    if (followUpsSection.items.length > 0) sections.push(followUpsSection);

    const remindersSection = this.gatherer.gatherReminders(date);
    if (remindersSection.items.length > 0) sections.push(remindersSection);

    const alterEgoSection = this.gatherer.gatherAlterEgoSummary(date);
    if (alterEgoSection.items.length > 0) sections.push(alterEgoSection);

    const weatherSection = await this.gatherer.gatherWeather();
    if (weatherSection.items.length > 0) sections.push(weatherSection);

    const financialSection = this.gatherer.gatherFinancial();
    if (financialSection.items.length > 0) sections.push(financialSection);

    const insightsSection = this.gatherer.gatherInsights();
    if (insightsSection.items.length > 0) sections.push(insightsSection);

    const intentSection = await this.gatherer.gatherIntentAlignment();
    if (intentSection.items.length > 0) sections.push(intentSection);

    sections.sort((a, b) => a.priority - b.priority);

    if (sections.length === 0) {
      const emptyBrief: MorningBrief = {
        id: nanoid(),
        date: dateStr,
        generatedAt: new Date().toISOString(),
        sections: [],
        summary: 'Nothing on your schedule today. Connect services in Settings → Connections to build your daily brief.',
        estimatedReadTimeSeconds: 5,
        dismissed: false,
      };
      this.deps.db.prepare(
        `INSERT INTO morning_briefs (id, date, generated_at, sections_json, summary, estimated_read_time_seconds, dismissed)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      ).run(emptyBrief.id, emptyBrief.date, emptyBrief.generatedAt, '[]', emptyBrief.summary, emptyBrief.estimatedReadTimeSeconds);
      return emptyBrief;
    }

    const summary = await synthesizeSummary(sections, this.deps.llm, this.deps.model);
    const estimatedReadTimeSeconds = computeReadTime(summary);

    const brief: MorningBrief = {
      id: nanoid(),
      date: dateStr,
      generatedAt: new Date().toISOString(),
      sections,
      summary,
      estimatedReadTimeSeconds,
      dismissed: false,
    };

    this.deps.db.prepare(
      `INSERT INTO morning_briefs (id, date, generated_at, sections_json, summary, estimated_read_time_seconds, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    ).run(
      brief.id, brief.date, brief.generatedAt,
      JSON.stringify(brief.sections), brief.summary,
      brief.estimatedReadTimeSeconds,
    );

    return brief;
  }

  getByDate(dateStr: string): MorningBrief | null {
    const row = this.deps.db.prepare(
      'SELECT * FROM morning_briefs WHERE date = ?',
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

  dismiss(briefId: string): void {
    this.deps.db.prepare(
      'UPDATE morning_briefs SET dismissed = 1 WHERE id = ?',
    ).run(briefId);
  }
}

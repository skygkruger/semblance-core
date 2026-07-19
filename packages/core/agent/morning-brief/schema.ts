import type { BriefSection } from './types.js';

export const CREATE_TABLES = `
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

export const SECTION_PRIORITIES: Record<BriefSection['type'], number> = {
  meetings: 1,
  reminders: 2,
  alter_ego_summary: 2.5,
  follow_ups: 3,
  intent_alignment: 4,
  weather: 5,
  financial: 6,
  insights: 7,
};

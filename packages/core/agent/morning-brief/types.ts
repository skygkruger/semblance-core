import type { DatabaseHandle } from '../../platform/types.js';
import type { CalendarIndexer } from '../../knowledge/calendar-indexer.js';
import type { ProactiveEngine } from '../proactive-engine.js';
import type { ReminderStore } from '../../knowledge/reminder-store.js';
import type { RecurringCharge } from '../../finance/interfaces.js';
import type { LLMProvider } from '../../llm/types.js';
import type { ContactStore } from '../../knowledge/contacts/contact-store.js';
import type { WeatherConditions, HourlyForecast } from '../../platform/weather-types.js';
import type { IntentManager } from '../intent-manager.js';
import type { AlterEgoStore } from '../alter-ego-store.js';

export interface MorningBrief {
  id: string;
  date: string;
  generatedAt: string;
  sections: BriefSection[];
  summary: string;
  estimatedReadTimeSeconds: number;
  dismissed: boolean;
}

export interface BriefSection {
  type: 'meetings' | 'follow_ups' | 'reminders' | 'weather' | 'financial' | 'insights' | 'intent_alignment' | 'alter_ego_summary';
  title: string;
  items: BriefItem[];
  priority: number;
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
  time: string;
}

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
  intentManager?: IntentManager;
  alterEgoStore?: AlterEgoStore;
  llm?: LLMProvider;
  model?: string;
}

export type {
  MorningBrief,
  BriefSection,
  BriefItem,
  MorningBriefPreferences,
  WeatherServiceLike,
  RecurringDetectorLike,
  RelationshipAnalyzerLike,
  SemanticSearchLike,
  MorningBriefDeps,
} from './types.js';

export { CREATE_TABLES, SECTION_PRIORITIES } from './schema.js';
export { MorningBriefGatherer } from './gatherers.js';
export { buildTemplateSummary, computeReadTime, synthesizeSummary } from './synthesis.js';
export { MorningBriefGenerator } from './generator.js';

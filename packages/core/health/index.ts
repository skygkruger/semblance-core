// Health & Wellness Extension — Entry point and barrel exports.
// Wires all health classes together into a SemblanceExtension.
// Registered via the extension interface — NOT hardcoded in orchestrator or proactive engine.
// CRITICAL: This file is in packages/core/. No network imports.

import type { SemblanceExtension } from '../extensions/types.js';
import type { DatabaseHandle } from '../platform/types.js';
import type { LLMProvider } from '../llm/types.js';
import type { PremiumGate } from '../premium/premium-gate.js';
import type { KnowledgeGraph } from '../knowledge/index.js';

import { HealthStore } from './health-store.js';
import { ManualEntryManager } from './manual-entry.js';
import { CorrelationEngine } from './correlation-engine.js';
import { HealthInsightGenerator } from './health-insights.js';
import { createHealthTools } from './extension-tools.js';
import { HealthInsightTracker } from './insight-tracker.js';

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { HealthStore } from './health-store.js';
export { ManualEntryManager } from './manual-entry.js';
export { CorrelationEngine } from './correlation-engine.js';
export { HealthInsightGenerator } from './health-insights.js';
export { createHealthTools } from './extension-tools.js';
export { HealthInsightTracker } from './insight-tracker.js';
export { NoOpHealthKitAdapter } from './healthkit-adapter.js';
export type { HealthKitAdapter } from './healthkit-adapter.js';
export type {
  HealthMetricType,
  HealthEntry,
  CorrelationResult,
  CalendarMetric,
  HealthInsight,
  TrendData,
  DailySeries,
} from './types.js';

// ─── Extension Factory ───────────────────────────────────────────────────────

export interface HealthExtensionDeps {
  db: DatabaseHandle;
  llm: LLMProvider;
  model: string;
  premiumGate: PremiumGate;
  knowledgeGraph: KnowledgeGraph;
}

export function createHealthExtension(deps: HealthExtensionDeps): SemblanceExtension {
  const store = new HealthStore({ db: deps.db });
  const manualEntry = new ManualEntryManager({ store });

  const correlationEngine = new CorrelationEngine({
    db: deps.db,
    knowledgeGraph: deps.knowledgeGraph,
  });

  const insightGenerator = new HealthInsightGenerator({
    correlationEngine,
    store,
    llm: deps.llm,
    model: deps.model,
  });

  const tools = createHealthTools({
    manualEntry,
    correlationEngine,
    store,
    premiumGate: deps.premiumGate,
    llm: deps.llm,
    model: deps.model,
  });

  const insightTracker = new HealthInsightTracker({
    insightGenerator,
    store,
    premiumGate: deps.premiumGate,
  });

  return {
    id: '@semblance/health',
    name: 'Health & Wellness Tracking',
    version: '1.0.0',
    tools,
    insightTrackers: [insightTracker],
    insightTypes: [
      'health-trend-change',
      'health-correlation-found',
      'health-anomaly-detected',
      'health-streak',
    ],
  };
}

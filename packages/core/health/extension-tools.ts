// Health Extension Tools — 3 tools registered via the extension interface.
// All isLocal: true — health data never touches the network.
// CRITICAL: This file is in packages/core/. No network imports.

import type { ExtensionTool } from '../extensions/types.js';
import type { ManualEntryManager } from './manual-entry.js';
import type { CorrelationEngine } from './correlation-engine.js';
import type { HealthStore } from './health-store.js';
import type { PremiumGate, PremiumFeature } from '../premium/premium-gate.js';
import type { LLMProvider } from '../llm/types.js';
import type { HealthMetricType } from './types.js';

interface HealthToolsDeps {
  manualEntry: ManualEntryManager;
  correlationEngine: CorrelationEngine;
  store: HealthStore;
  premiumGate: PremiumGate;
  llm: LLMProvider;
  model: string;
}

export function createHealthTools(deps: HealthToolsDeps): ExtensionTool[] {
  return [
    {
      definition: {
        name: 'log_health',
        description: 'Log a manual health entry (mood, energy, symptom, medication, water)',
        parameters: {
          type: 'object',
          properties: {
            metricType: { type: 'string', enum: ['mood', 'energy', 'symptom', 'medication', 'water'] },
            value: { type: 'number' },
            label: { type: 'string' },
          },
          required: ['metricType', 'value'],
        },
      },
      handler: async (args) => {
        if (!deps.premiumGate.isFeatureAvailable('health-tracking' as PremiumFeature)) {
          return { error: 'Health tracking requires Digital Representative' };
        }

        const type = args['metricType'] as string;
        const value = args['value'] as number;
        const label = args['label'] as string | undefined;

        switch (type) {
          case 'mood':
            return { result: deps.manualEntry.logMood(value as 1 | 2 | 3 | 4 | 5, label) };
          case 'energy':
            return { result: deps.manualEntry.logEnergy(value as 1 | 2 | 3 | 4 | 5, label) };
          case 'symptom':
            return { result: deps.manualEntry.logSymptom(label ?? 'unspecified', value) };
          case 'medication':
            return { result: deps.manualEntry.logMedication(label ?? 'unknown', String(value)) };
          case 'water':
            return { result: deps.manualEntry.logWater(value, 'glasses') };
          default:
            return { error: `Unknown metric type: ${type}` };
        }
      },
      isLocal: true,
    },
    {
      definition: {
        name: 'health_summary',
        description: 'Get recent health entries, trends, and correlations for a time window',
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Number of days to look back (default 7)' },
          },
        },
      },
      handler: async (args) => {
        if (!deps.premiumGate.isFeatureAvailable('health-tracking' as PremiumFeature)) {
          return { error: 'Health tracking requires Digital Representative' };
        }

        const days = (args['days'] as number | undefined) ?? 7;
        const entries = deps.store.getLatestEntries(days * 5);
        return { result: { entries, days } };
      },
      isLocal: true,
    },
    {
      definition: {
        name: 'health_correlations',
        description: 'Get computed health correlations with natural language descriptions',
        parameters: {
          type: 'object',
          properties: {
            windowDays: { type: 'number', description: 'Correlation window in days (default 30)' },
          },
        },
      },
      handler: async (args) => {
        if (!deps.premiumGate.isFeatureAvailable('health-insights' as PremiumFeature)) {
          return { error: 'Health insights requires Digital Representative' };
        }

        const windowDays = (args['windowDays'] as number | undefined) ?? 30;
        const correlations = await deps.correlationEngine.computeCorrelations(windowDays);

        // Add descriptions via LLM
        for (const corr of correlations) {
          corr.description = await deps.correlationEngine.generateInsightDescription(
            corr, deps.llm, deps.model,
          );
        }

        return { result: correlations };
      },
      isLocal: true,
    },
  ];
}

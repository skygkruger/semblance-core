/**
 * Step 26 — SelectiveExporter tests (Commit 3).
 * Tests config-driven section inclusion and entity filtering.
 */

import { describe, it, expect } from 'vitest';
import { SelectiveExporter } from '@semblance/core/living-will/selective-export';
import type { LivingWillSectionData, LivingWillExportConfig } from '@semblance/core/living-will/types';

function createExporter(): SelectiveExporter {
  return new SelectiveExporter();
}

function makeFullData(): LivingWillSectionData {
  return {
    knowledgeGraph: {
      entities: [
        { id: 'e1', name: 'Alice', type: 'person' },
        { id: 'e2', name: 'Bank of Test', type: 'financial' },
        { id: 'e3', name: 'Dr. Smith', type: 'health' },
        { id: 'e4', name: 'Project X', type: 'project' },
      ],
    },
    styleProfile: { tone: { formalityScore: 0.6 } },
    decisionProfile: { patterns: ['approve-emails'] },
    relationshipMap: { contacts: [{ name: 'Bob' }] },
    preferences: { autonomy: { email: 'partner' } },
    actionSummary: { totalActions: 42 },
  };
}

describe('SelectiveExporter (Step 26)', () => {
  it('default config includes all sections', () => {
    const exporter = createExporter();
    const config: LivingWillExportConfig = {};
    const result = exporter.applyConfig(makeFullData(), config);

    expect(result.knowledgeGraph).toBeDefined();
    expect(result.styleProfile).toBeDefined();
    expect(result.decisionProfile).toBeDefined();
    expect(result.relationshipMap).toBeDefined();
    expect(result.preferences).toBeDefined();
    expect(result.actionSummary).toBeDefined();
  });

  it('includeStyleProfile: false excludes style profile from archive', () => {
    const exporter = createExporter();
    const config: LivingWillExportConfig = { includeStyleProfile: false };
    const result = exporter.applyConfig(makeFullData(), config);

    expect(result.styleProfile).toBeUndefined();
    expect(result.knowledgeGraph).toBeDefined();
  });

  it('excludeFinancialData: true strips financial entities from knowledge graph', () => {
    const exporter = createExporter();
    const config: LivingWillExportConfig = { excludeFinancialData: true };
    const result = exporter.applyConfig(makeFullData(), config);

    const kg = result.knowledgeGraph as Record<string, unknown>;
    const entities = kg.entities as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(3);
    expect(entities.find((e) => e.type === 'financial')).toBeUndefined();
    expect(entities.find((e) => e.name === 'Alice')).toBeDefined();
  });

  it('excludeHealthData: true strips health entities from knowledge graph', () => {
    const exporter = createExporter();
    const config: LivingWillExportConfig = { excludeHealthData: true };
    const result = exporter.applyConfig(makeFullData(), config);

    const kg = result.knowledgeGraph as Record<string, unknown>;
    const entities = kg.entities as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(3);
    expect(entities.find((e) => e.type === 'health')).toBeUndefined();
    expect(entities.find((e) => e.name === 'Alice')).toBeDefined();
  });

  it('multiple exclusions work together', () => {
    const exporter = createExporter();
    const config: LivingWillExportConfig = {
      excludeFinancialData: true,
      excludeHealthData: true,
      includeActionSummary: false,
    };
    const result = exporter.applyConfig(makeFullData(), config);

    const kg = result.knowledgeGraph as Record<string, unknown>;
    const entities = kg.entities as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(2); // Alice + Project X
    expect(result.actionSummary).toBeUndefined();
    expect(result.styleProfile).toBeDefined();
  });
});

// Selective Export — Filters sections and entities based on export config.
// CRITICAL: No networking imports.

import type { LivingWillExportConfig, LivingWillSectionData } from './types.js';

/**
 * Handles selective filtering of Living Will data before archive assembly.
 */
export class SelectiveExporter {
  /**
   * Filter knowledge graph entities based on exclude flags.
   * Strips financial/health entities when the corresponding flag is set.
   */
  filterKnowledgeGraph(
    entities: Array<Record<string, unknown>>,
    config: LivingWillExportConfig,
  ): Array<Record<string, unknown>> {
    return entities.filter((entity) => {
      if (config.excludeFinancialData && isFinancialEntity(entity)) return false;
      if (config.excludeHealthData && isHealthEntity(entity)) return false;
      return true;
    });
  }

  /**
   * Apply the export config to full section data, returning only included sections
   * with appropriate filtering applied.
   */
  applyConfig(
    fullData: LivingWillSectionData,
    config: LivingWillExportConfig,
  ): LivingWillSectionData {
    const result: LivingWillSectionData = {};

    // Default: include everything unless explicitly excluded
    const includeKG = config.includeKnowledgeGraph !== false;
    const includeStyle = config.includeStyleProfile !== false;
    const includeDecision = config.includeDecisionProfile !== false;
    const includeRelationship = config.includeRelationshipMap !== false;
    const includePrefs = config.includePreferences !== false;
    const includeActions = config.includeActionSummary !== false;

    if (includeKG && fullData.knowledgeGraph !== undefined) {
      const kg = fullData.knowledgeGraph as Record<string, unknown>;
      if (kg.entities && Array.isArray(kg.entities)) {
        result.knowledgeGraph = {
          ...kg,
          entities: this.filterKnowledgeGraph(
            kg.entities as Array<Record<string, unknown>>,
            config,
          ),
        };
      } else {
        result.knowledgeGraph = fullData.knowledgeGraph;
      }
    }

    if (includeStyle && fullData.styleProfile !== undefined) {
      result.styleProfile = fullData.styleProfile;
    }

    if (includeDecision && fullData.decisionProfile !== undefined) {
      result.decisionProfile = fullData.decisionProfile;
    }

    if (includeRelationship && fullData.relationshipMap !== undefined) {
      result.relationshipMap = fullData.relationshipMap;
    }

    if (includePrefs && fullData.preferences !== undefined) {
      result.preferences = fullData.preferences;
    }

    if (includeActions && fullData.actionSummary !== undefined) {
      result.actionSummary = fullData.actionSummary;
    }

    return result;
  }
}

function isFinancialEntity(entity: Record<string, unknown>): boolean {
  const type = String(entity.type ?? '').toLowerCase();
  return type === 'financial' || type === 'transaction' || type === 'subscription' || type === 'bank_account';
}

function isHealthEntity(entity: Record<string, unknown>): boolean {
  const type = String(entity.type ?? '').toLowerCase();
  return type === 'health' || type === 'medical' || type === 'wellness' || type === 'fitness';
}

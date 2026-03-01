// Connector → Category Map Tests — 8 tests for the visualization category mapping layer.

import { describe, it, expect } from 'vitest';
import {
  CONNECTOR_TO_CATEGORY,
  CATEGORY_META,
  getVisualizationCategory,
  getCategoryForEntityType,
  getAllCategories,
} from '../../../packages/core/knowledge/connector-category-map.js';
import { createDefaultConnectorRegistry } from '../../../packages/core/importers/connector-registry.js';

describe('Connector Category Map', () => {
  const registry = createDefaultConnectorRegistry();

  it('every registered connector ID maps to exactly one VisualizationCategory', () => {
    const allConnectors = registry.listAll();
    const unmapped: string[] = [];

    for (const connector of allConnectors) {
      const category = CONNECTOR_TO_CATEGORY[connector.id];
      if (!category) {
        unmapped.push(connector.id);
      }
    }

    // chrome-history and firefox-history don't exist in registry, so no unmapped expected
    expect(unmapped).toEqual([]);
  });

  it('no category is empty — at least 1 connector or entity type maps to each', () => {
    const allCategories = getAllCategories();
    const connectorCategories = new Set(Object.values(CONNECTOR_TO_CATEGORY));

    // 'people' has no connectors but is reached via getCategoryForEntityType('person')
    const entityOnlyCategories = new Set<string>();
    entityOnlyCategories.add(getCategoryForEntityType('person'));
    entityOnlyCategories.add(getCategoryForEntityType('email_thread'));

    for (const cat of allCategories) {
      const hasConnectors = connectorCategories.has(cat);
      const hasEntityMapping = entityOnlyCategories.has(cat);
      expect(
        hasConnectors || hasEntityMapping,
        `Category '${cat}' has no connector or entity type mapping`,
      ).toBe(true);
    }
  });

  it('getVisualizationCategory returns null for unknown IDs', () => {
    expect(getVisualizationCategory('nonexistent-connector')).toBeNull();
    expect(getVisualizationCategory('')).toBeNull();
    expect(getVisualizationCategory('chrome-history')).toBeNull();
    expect(getVisualizationCategory('firefox-history')).toBeNull();
  });

  it('reclassified connectors are correct: toggl→work, safari-history→browser, obsidian→knowledge', () => {
    // toggl is health_fitness in registry but work for visualization
    expect(getVisualizationCategory('toggl')).toBe('work');
    expect(getVisualizationCategory('rescuetime')).toBe('work');

    // safari-history is productivity in registry but browser for visualization
    expect(getVisualizationCategory('safari-history')).toBe('browser');
    expect(getVisualizationCategory('edge-history')).toBe('browser');
    expect(getVisualizationCategory('arc-history')).toBe('browser');

    // obsidian is productivity in registry but knowledge for visualization
    expect(getVisualizationCategory('obsidian')).toBe('knowledge');
    expect(getVisualizationCategory('notion-export')).toBe('knowledge');
    expect(getVisualizationCategory('bear-export')).toBe('knowledge');
    expect(getVisualizationCategory('evernote-export')).toBe('knowledge');
  });

  it('getCategoryForEntityType("person") returns "people"', () => {
    expect(getCategoryForEntityType('person')).toBe('people');
    expect(getCategoryForEntityType('email_thread')).toBe('people');
    expect(getCategoryForEntityType('location')).toBe('people');
  });

  it('getCategoryForEntityType("document") with source metadata routes correctly', () => {
    expect(getCategoryForEntityType('document', { source: 'financial' })).toBe('finance');
    expect(getCategoryForEntityType('document', { source: 'health' })).toBe('health');
    expect(getCategoryForEntityType('document', { source: 'browser_history' })).toBe('browser');
    expect(getCategoryForEntityType('document', { source: 'local_file' })).toBe('knowledge');
    expect(getCategoryForEntityType('document')).toBe('knowledge');
  });

  it('getAllCategories returns exactly 10 categories', () => {
    const categories = getAllCategories();
    expect(categories).toHaveLength(10);
    expect(new Set(categories).size).toBe(10);

    // Verify all expected categories present
    expect(categories).toContain('health');
    expect(categories).toContain('finance');
    expect(categories).toContain('social');
    expect(categories).toContain('work');
    expect(categories).toContain('reading');
    expect(categories).toContain('music');
    expect(categories).toContain('cloud');
    expect(categories).toContain('browser');
    expect(categories).toContain('people');
    expect(categories).toContain('knowledge');
  });

  it('CATEGORY_META has displayName, color, icon for every category', () => {
    const allCategories = getAllCategories();

    for (const catId of allCategories) {
      const meta = CATEGORY_META[catId];
      expect(meta, `Missing CATEGORY_META for '${catId}'`).toBeDefined();
      expect(meta.id).toBe(catId);
      expect(meta.displayName.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });

  it('CATEGORY_META colors align with design tokens for finance, reading, browser', () => {
    // finance → --amber (#C9A85C)
    expect(CATEGORY_META.finance.color).toBe('#C9A85C');
    // reading → --rust (#C97B6E)
    expect(CATEGORY_META.reading.color).toBe('#C97B6E');
    // browser → --v (Veridian #6ECFA3)
    expect(CATEGORY_META.browser.color).toBe('#6ECFA3');
    // cloud stays --sv2 (#8B93A7)
    expect(CATEGORY_META.cloud.color).toBe('#8B93A7');
  });
});

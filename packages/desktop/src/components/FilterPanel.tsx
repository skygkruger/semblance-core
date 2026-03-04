/**
 * FilterPanel — Left sidebar for toggling category visibility in the Knowledge Graph.
 *
 * 240px width. Each row: colored dot + category name + node count + toggle switch.
 */

import React from 'react';
import type { CategoryNode } from '../../../core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../../core/knowledge/connector-category-map';
import './FilterPanel.css';

export interface FilterPanelProps {
  categories: CategoryNode[];
  enabledCategories: Set<VisualizationCategory>;
  onToggleCategory: (category: VisualizationCategory) => void;
  onResetFilters: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  categories,
  enabledCategories,
  onToggleCategory,
  onResetFilters,
}) => {
  return (
    <div data-testid="filter-panel" className="filter-panel">
      <div className="filter-panel__title">Filter Categories</div>

      {categories.map(cat => {
        const enabled = enabledCategories.has(cat.category);
        return (
          <div
            key={cat.id}
            data-testid={`filter-row-${cat.category}`}
            className={`filter-panel__row${enabled ? '' : ' filter-panel__row--disabled'}`}
            onClick={() => onToggleCategory(cat.category)}
          >
            <div className="filter-panel__dot" style={{ backgroundColor: cat.color }} />
            <div className="filter-panel__label">{cat.label}</div>
            <div className="filter-panel__count">{cat.nodeCount}</div>
            <div
              data-testid={`filter-toggle-${cat.category}`}
              className={`filter-panel__toggle ${enabled ? 'filter-panel__toggle--on' : 'filter-panel__toggle--off'}`}
            >
              <div className="filter-panel__toggle-thumb" />
            </div>
          </div>
        );
      })}

      <button
        data-testid="filter-reset"
        onClick={onResetFilters}
        className="filter-panel__reset"
      >
        Reset Filters
      </button>
    </div>
  );
};

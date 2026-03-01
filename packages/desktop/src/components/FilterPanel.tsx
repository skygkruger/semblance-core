/**
 * FilterPanel — Left sidebar for toggling category visibility in the Knowledge Graph.
 *
 * 240px width. Each row: colored dot + category name + node count + toggle switch.
 * Uses v3 design tokens for all chrome. Category color swatches use CATEGORY_META
 * color values directly (data-driven, not brand chrome).
 */

import React from 'react';
import type { CategoryNode } from '../../../core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../../core/knowledge/connector-category-map';

// ─── Design Tokens (from packages/semblance-ui/tokens/tokens.css) ────────────
// Inline hex values matching CSS custom properties — React inline styles can't use var()

const TOKEN = {
  base: '#0B0E11',
  b2: 'rgba(255, 255, 255, 0.09)',
  sv3: '#A8B4C0',
  white: '#EEF1F4',
  v: '#6ECFA3',
  s2: '#171B1F',
  fontBody: "'DM Sans', system-ui, sans-serif",
  fontMono: "'DM Mono', monospace",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FilterPanelProps {
  categories: CategoryNode[];
  enabledCategories: Set<VisualizationCategory>;
  onToggleCategory: (category: VisualizationCategory) => void;
  onResetFilters: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const FilterPanel: React.FC<FilterPanelProps> = ({
  categories,
  enabledCategories,
  onToggleCategory,
  onResetFilters,
}) => {
  return (
    <div
      data-testid="filter-panel"
      style={{
        width: 240,
        background: TOKEN.base,
        borderRight: `1px solid ${TOKEN.b2}`,
        padding: 16,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: TOKEN.fontBody,
          fontSize: 13,
          fontWeight: 600,
          color: TOKEN.white,
          marginBottom: 12,
        }}
      >
        Filter Categories
      </div>

      {categories.map(cat => {
        const enabled = enabledCategories.has(cat.category);
        return (
          <div
            key={cat.id}
            data-testid={`filter-row-${cat.category}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 4,
              opacity: enabled ? 1 : 0.4,
              cursor: 'pointer',
            }}
            onClick={() => onToggleCategory(cat.category)}
          >
            {/* Category color dot */}
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: cat.color,
                flexShrink: 0,
              }}
            />

            {/* Category name */}
            <div
              style={{
                flex: 1,
                fontFamily: TOKEN.fontBody,
                fontSize: 13,
                color: TOKEN.sv3,
              }}
            >
              {cat.label}
            </div>

            {/* Node count */}
            <div
              style={{
                fontFamily: TOKEN.fontMono,
                fontSize: 11,
                color: TOKEN.sv3,
                marginRight: 8,
              }}
            >
              {cat.nodeCount}
            </div>

            {/* Toggle switch */}
            <div
              data-testid={`filter-toggle-${cat.category}`}
              style={{
                width: 28,
                height: 16,
                borderRadius: 8,
                backgroundColor: enabled ? TOKEN.v : TOKEN.s2,
                position: 'relative',
                transition: 'background-color 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: TOKEN.white,
                  position: 'absolute',
                  top: 2,
                  left: enabled ? 14 : 2,
                  transition: 'left 0.2s',
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Reset button */}
      <button
        data-testid="filter-reset"
        onClick={onResetFilters}
        style={{
          marginTop: 12,
          padding: '6px 12px',
          background: 'transparent',
          border: `1px solid ${TOKEN.b2}`,
          borderRadius: 4,
          color: TOKEN.sv3,
          fontFamily: TOKEN.fontBody,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Reset Filters
      </button>
    </div>
  );
};

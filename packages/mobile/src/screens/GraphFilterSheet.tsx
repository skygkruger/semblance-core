/**
 * GraphFilterSheet — Bottom sheet for toggling category visibility on mobile.
 *
 * Switch toggles per category. Uses v3 design tokens.
 * Matches KnowledgeGraphScreen.styles.ts layout conventions.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Switch, ScrollView, StyleSheet } from 'react-native';
import type { CategoryNode } from '../../../../packages/core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../../../packages/core/knowledge/connector-category-map';

// ─── Design Tokens (from packages/semblance-ui/tokens/tokens.css) ────────────

const TOKEN = {
  base: '#0B0E11',
  b2: 'rgba(255, 255, 255, 0.09)',
  sv3: '#A8B4C0',
  white: '#EEF1F4',
  v: '#6ECFA3',
  s2: '#171B1F',
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GraphFilterSheetProps {
  categories: CategoryNode[];
  enabledCategories: Set<VisualizationCategory>;
  onToggleCategory: (category: VisualizationCategory) => void;
  onClose: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const GraphFilterSheet: React.FC<GraphFilterSheetProps> = ({
  categories,
  enabledCategories,
  onToggleCategory,
  onClose,
}) => {
  return (
    <View style={sheetStyles.container} testID="graph-filter-sheet">
      <View style={sheetStyles.handle} />

      <View style={sheetStyles.header}>
        <Text style={sheetStyles.title}>Filter Categories</Text>
        <TouchableOpacity onPress={onClose} testID="filter-close">
          <Text style={sheetStyles.closeText}>[x]</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={sheetStyles.list}>
        {categories.map(cat => {
          const enabled = enabledCategories.has(cat.category);
          return (
            <View
              key={cat.id}
              style={sheetStyles.row}
              testID={`filter-row-${cat.category}`}
            >
              {/* Category color dot */}
              <View
                style={[sheetStyles.dot, { backgroundColor: cat.color }]}
              />

              {/* Category name */}
              <Text style={[sheetStyles.label, !enabled && sheetStyles.labelDisabled]}>
                {cat.label}
              </Text>

              {/* Node count */}
              <Text style={sheetStyles.count}>{cat.nodeCount}</Text>

              {/* Toggle switch */}
              <Switch
                value={enabled}
                onValueChange={() => onToggleCategory(cat.category)}
                trackColor={{ false: TOKEN.s2, true: TOKEN.v }}
                thumbColor={TOKEN.white}
                testID={`filter-toggle-${cat.category}`}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const sheetStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: TOKEN.base,
    borderTopWidth: 1,
    borderTopColor: TOKEN.b2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    maxHeight: 400,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: TOKEN.sv3,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: TOKEN.white,
    fontFamily: 'DM Sans',
  },
  closeText: {
    fontSize: 13,
    color: TOKEN.sv3,
    fontFamily: 'DM Mono',
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: TOKEN.sv3,
    fontFamily: 'DM Sans',
  },
  labelDisabled: {
    opacity: 0.4,
  },
  count: {
    fontSize: 12,
    color: TOKEN.sv3,
    fontFamily: 'DM Mono',
    marginRight: 8,
  },
});

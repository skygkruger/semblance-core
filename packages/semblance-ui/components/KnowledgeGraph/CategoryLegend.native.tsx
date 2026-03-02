import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { KnowledgeNode, CategoryLegendItem } from './graph-types';

interface CategoryLegendProps {
  categories: CategoryLegendItem[];
  leftOffset?: number;
  onCategoryClick?: (categoryId: string) => void;
  compact?: boolean;
}

export function deriveLegendCategories(nodes: KnowledgeNode[]): CategoryLegendItem[] {
  return nodes
    .filter(n => n.type === 'category')
    .map(n => ({
      id: n.id,
      label: n.label,
      color: (n.metadata?.color as string) ?? '#6ECFA3',
      nodeCount: (n.metadata?.nodeCount as number) ?? 0,
      category: n.metadata?.category,
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}

export function CategoryLegend({ categories, onCategoryClick, compact }: CategoryLegendProps) {
  const { t } = useTranslation();
  if (categories.length === 0) return null;

  // Compact mode: horizontal dot row at bottom (mobile)
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        {categories.map(cat => {
          const isLocked = cat.nodeCount === 0;
          const isPeople = cat.category === 'people';
          return (
            <Pressable
              key={cat.id}
              onPress={onCategoryClick && !isLocked ? () => onCategoryClick(cat.id) : undefined}
              hitSlop={6}
            >
              <View
                style={[
                  styles.compactDot,
                  {
                    backgroundColor: isPeople ? '#F5E6C8' : cat.color,
                    opacity: isLocked ? 0.3 : 1,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  // Full card mode (desktop-like, but used on tablet)
  return (
    <View style={styles.cardContainer}>
      <Text style={styles.cardTitle}>{t('screen.knowledge_graph.your_life_data')}</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        {categories.map(cat => {
          const isLocked = cat.nodeCount === 0;
          const isPeople = cat.category === 'people';
          return (
            <Pressable
              key={cat.id}
              onPress={onCategoryClick && !isLocked ? () => onCategoryClick(cat.id) : undefined}
              style={[styles.cardRow, { opacity: isLocked ? 0.4 : 1 }]}
            >
              <View
                style={[
                  styles.cardDot,
                  {
                    backgroundColor: isPeople ? '#F5E6C8' : cat.color,
                  },
                ]}
              />
              <Text style={styles.cardLabel} numberOfLines={1}>
                {cat.label}
              </Text>
              <Text style={styles.cardCount}>
                {isLocked ? '0' : cat.nodeCount}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  compactContainer: {
    position: 'absolute',
    bottom: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  compactDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cardContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 180,
    backgroundColor: '#111518',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  cardTitle: {
    fontFamily: 'DMMono-Regular',
    fontSize: 10,
    color: '#525A64',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    paddingHorizontal: 4,
    gap: 8,
  },
  cardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardLabel: {
    flex: 1,
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#A8B4C0',
  },
  cardCount: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: '#5E6B7C',
    textAlign: 'right',
  },
});

// Knowledge Graph Drill-Down List — Native (React Native) implementation.
// Shows knowledge items within a category with search, pagination, item click.

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';
import type { DrillDownItem, DrillDownListProps } from './DrillDownList.web';

export type { DrillDownItem, DrillDownListProps };

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'local_file': return '[F]';
    case 'email': return '[@]';
    case 'calendar': return '[C]';
    case 'browser_history': return '[/]';
    case 'financial': return '[$]';
    case 'health': return '[+]';
    case 'contact': return '[P]';
    case 'note': return '[N]';
    case 'conversation': return '[>]';
    default: return '[D]';
  }
}

export function DrillDownList({
  categoryLabel,
  categoryColor,
  items,
  total,
  loading,
  onSearch,
  onLoadMore,
  onItemClick,
  hasMore,
}: DrillDownListProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearch(val), 300);
  }, [onSearch]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const renderItem = useCallback(({ item }: { item: DrillDownItem }) => (
    <Pressable style={styles.item} onPress={() => onItemClick(item)} accessibilityRole="button">
      <View style={styles.itemHeader}>
        <Text style={styles.itemIcon}>{getSourceIcon(item.source)}</Text>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
      </View>
      <Text style={styles.itemPreview} numberOfLines={1}>{item.preview}</Text>
      <View style={styles.itemMeta}>
        <Text style={styles.itemMetaText}>{formatDate(item.indexedAt)}</Text>
        {item.mimeType ? <Text style={styles.itemMetaText}>{item.mimeType}</Text> : null}
      </View>
    </Pressable>
  ), [onItemClick]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: categoryColor }]} />
        <Text style={styles.label}>{categoryLabel}</Text>
        <Text style={styles.count}>{total}</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder={t('knowledge_graph.search_items', 'Search items...')}
        placeholderTextColor="#525A64"
        value={searchValue}
        onChangeText={handleSearchChange}
        accessibilityLabel={t('knowledge_graph.search_items', 'Search items...')}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.chunkId}
        renderItem={renderItem}
        style={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? null : (
            <Text style={styles.empty}>
              {searchValue
                ? t('knowledge_graph.no_search_results', 'No items match your search')
                : t('knowledge_graph.no_items', 'No items in this category')}
            </Text>
          )
        }
        ListFooterComponent={
          <>
            {loading && <ActivityIndicator size="small" color={brandColors.veridian} style={styles.loader} />}
            {hasMore && !loading && (
              <Pressable style={styles.loadMore} onPress={onLoadMore}>
                <Text style={styles.loadMoreText}>{t('knowledge_graph.load_more', 'Load more')}</Text>
              </Pressable>
            )}
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: nativeSpacing.s4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(133, 147, 164, 0.7)',
  },
  count: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: '#5E6B7C',
    marginLeft: 'auto',
  },
  search: {
    padding: 8,
    paddingHorizontal: 12,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: nativeRadius.sm,
    marginBottom: 8,
  },
  list: {
    maxHeight: 400,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: '#5E6B7C',
  },
  itemTitle: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    flex: 1,
  },
  itemPreview: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 11,
    color: '#525A64',
    marginLeft: 24,
    marginTop: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 24,
    marginTop: 4,
  },
  itemMetaText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: '#3E4652',
  },
  empty: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: '#525A64',
    textAlign: 'center',
    paddingVertical: 24,
  },
  loader: {
    paddingVertical: 16,
  },
  loadMore: {
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.15)',
    borderRadius: nativeRadius.sm,
    alignItems: 'center',
  },
  loadMoreText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
});

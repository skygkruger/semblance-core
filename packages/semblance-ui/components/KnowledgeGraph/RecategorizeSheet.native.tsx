// Recategorize Sheet — React Native implementation.
// Bottom sheet with AI suggestions, category search, and create-new.

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';
import type { RecategorizeSheetProps, CategoryInfo, CategorySuggestion } from './RecategorizeSheet.types';

export function RecategorizeSheet({
  isOpen,
  currentCategory,
  suggestions,
  allCategories,
  loadingSuggestions,
  onClose,
  onSelectCategory,
  onCreateCategory,
}: RecategorizeSheetProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (!isOpen) setSearchValue('');
  }, [isOpen]);

  const filteredCategories = useMemo(() => {
    if (!searchValue.trim()) return allCategories;
    const q = searchValue.toLowerCase();
    return allCategories.filter(c => c.category.toLowerCase().includes(q));
  }, [allCategories, searchValue]);

  const showCreateNew = useMemo(() => {
    if (!searchValue.trim()) return false;
    const q = searchValue.toLowerCase();
    return !allCategories.some(c => c.category.toLowerCase() === q);
  }, [allCategories, searchValue]);

  const handleSelect = useCallback((category: string) => {
    if (category === currentCategory) return;
    onSelectCategory(category);
  }, [currentCategory, onSelectCategory]);

  const handleCreate = useCallback(() => {
    const name = searchValue.trim();
    if (!name) return;
    onCreateCategory(name);
  }, [searchValue, onCreateCategory]);

  const renderSuggestion = useCallback(({ item }: { item: CategorySuggestion }) => (
    <Pressable
      style={[styles.suggestion, item.category === currentCategory ? styles.disabled : null]}
      onPress={() => handleSelect(item.category)}
      disabled={item.category === currentCategory}
      accessibilityRole="button"
    >
      <View style={styles.suggestionDot} />
      <View style={styles.suggestionInfo}>
        <Text style={styles.suggestionName}>{item.category}</Text>
        <Text style={styles.suggestionReason} numberOfLines={1}>{item.reason}</Text>
      </View>
      <Text style={styles.confidence}>{Math.round(item.confidence * 100)}%</Text>
    </Pressable>
  ), [currentCategory, handleSelect]);

  const renderCategory = useCallback(({ item }: { item: CategoryInfo }) => (
    <Pressable
      style={[styles.categoryRow, item.category === currentCategory ? styles.disabled : null]}
      onPress={() => handleSelect(item.category)}
      disabled={item.category === currentCategory}
      accessibilityRole="button"
    >
      <View style={[styles.categoryDot, { backgroundColor: item.color }]} />
      <Text style={styles.categoryName}>{item.category}</Text>
      <Text style={styles.categoryCount}>{item.count}</Text>
    </Pressable>
  ), [currentCategory, handleSelect]);

  if (!isOpen) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>{t('knowledge_graph.recategorize', 'Recategorize')}</Text>
            <Text style={styles.current}>{t('knowledge_graph.current', 'Current')}: {currentCategory}</Text>
          </View>

          <View style={styles.searchWrapper}>
            <TextInput
              style={styles.search}
              placeholder={t('knowledge_graph.search_categories', 'Search or create category...')}
              placeholderTextColor="#525A64"
              value={searchValue}
              onChangeText={setSearchValue}
              accessibilityLabel={t('knowledge_graph.search_categories', 'Search or create category...')}
              autoFocus
            />
          </View>

          {/* AI Suggestions */}
          {!searchValue.trim() && (
            <>
              <Text style={styles.sectionLabel}>{t('knowledge_graph.suggested', 'Suggested')}</Text>
              {loadingSuggestions ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={brandColors.veridian} />
                  <Text style={styles.loadingText}>{t('knowledge_graph.analyzing', 'Analyzing...')}</Text>
                </View>
              ) : suggestions.length > 0 ? (
                <FlatList
                  data={suggestions}
                  keyExtractor={(item) => item.category}
                  renderItem={renderSuggestion}
                  scrollEnabled={false}
                />
              ) : null}

              <View style={styles.separator} />
              <Text style={styles.sectionLabel}>{t('knowledge_graph.all_categories', 'All categories')}</Text>
            </>
          )}

          {/* Category List */}
          <FlatList
            data={filteredCategories}
            keyExtractor={(item) => item.category}
            renderItem={renderCategory}
            style={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              showCreateNew ? (
                <Pressable style={styles.createRow} onPress={handleCreate} accessibilityRole="button">
                  <Text style={styles.createIcon}>+</Text>
                  <Text style={styles.createLabel}>{t('knowledge_graph.create_category', 'Create "{{name}}"', { name: searchValue.trim() })}</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              !showCreateNew ? (
                <Text style={styles.empty}>{t('knowledge_graph.no_categories', 'No matching categories')}</Text>
              ) : null
            }
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: brandColors.s1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: brandColors.b2,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: 14,
    color: brandColors.white,
  },
  current: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  searchWrapper: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  search: {
    padding: 8,
    paddingHorizontal: 12,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.wDim,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: nativeRadius.sm,
  },
  sectionLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(133, 147, 164, 0.7)',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  loadingText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 12,
    color: '#525A64',
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  suggestionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brandColors.veridian,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 13,
    color: brandColors.wDim,
  },
  suggestionReason: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 11,
    color: '#525A64',
    marginTop: 2,
  },
  confidence: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.sv1,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 8,
    marginHorizontal: 20,
  },
  list: {
    maxHeight: 300,
    paddingBottom: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryName: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 13,
    color: brandColors.wDim,
    flex: 1,
  },
  categoryCount: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.sv1,
  },
  disabled: {
    opacity: 0.4,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
  },
  createIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 12,
    color: brandColors.veridian,
    width: 8,
    textAlign: 'center',
  },
  createLabel: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 13,
    color: brandColors.veridian,
  },
  empty: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 12,
    color: '#525A64',
    textAlign: 'center',
    paddingVertical: 24,
  },
});

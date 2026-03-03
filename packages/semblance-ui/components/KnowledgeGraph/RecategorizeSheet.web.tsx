// Recategorize Sheet — Web implementation.
// Bottom-sliding sheet with AI suggestions, category search, and create-new.

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { RecategorizeSheetProps } from './RecategorizeSheet.types';
import './recategorize-sheet.css';

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

  // Reset search when sheet opens/closes
  useEffect(() => {
    if (!isOpen) setSearchValue('');
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleSelect = useCallback((category: string) => {
    if (category === currentCategory) return;
    onSelectCategory(category);
  }, [currentCategory, onSelectCategory]);

  const handleCreate = useCallback(() => {
    const name = searchValue.trim();
    if (!name) return;
    onCreateCategory(name);
  }, [searchValue, onCreateCategory]);

  if (!isOpen) return null;

  return (
    <div className="kg-recat-backdrop" onClick={handleBackdropClick}>
      <div className="kg-recat" role="dialog" aria-modal="true">
        <div className="kg-recat__handle" />

        <div className="kg-recat__header">
          <h3 className="kg-recat__title">
            {t('knowledge_graph.recategorize', 'Recategorize')}
          </h3>
          <span className="kg-recat__current">
            {t('knowledge_graph.current', 'Current')}: {currentCategory}
          </span>
        </div>

        <div className="kg-recat__search">
          <input
            type="text"
            placeholder={t('knowledge_graph.search_categories', 'Search or create category...')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            aria-label={t('knowledge_graph.search_categories', 'Search or create category...')}
            autoFocus
          />
        </div>

        {/* AI Suggestions */}
        {!searchValue.trim() && (
          <>
            <div className="kg-recat__section-label">
              {t('knowledge_graph.suggested', 'Suggested')}
            </div>

            {loadingSuggestions ? (
              <div className="kg-recat__suggestions-loading">
                <span className="kg-drilldown__spinner" />
                {t('knowledge_graph.analyzing', 'Analyzing...')}
              </div>
            ) : suggestions.length > 0 ? (
              suggestions.map((s) => (
                <button
                  key={s.category}
                  className="kg-recat__suggestion"
                  onClick={() => handleSelect(s.category)}
                  disabled={s.category === currentCategory}
                  type="button"
                >
                  <span className="kg-recat__suggestion-dot" />
                  <div className="kg-recat__suggestion-info">
                    <div className="kg-recat__suggestion-name">{s.category}</div>
                    <div className="kg-recat__suggestion-reason">{s.reason}</div>
                  </div>
                  <span className="kg-recat__suggestion-confidence">
                    {Math.round(s.confidence * 100)}%
                  </span>
                </button>
              ))
            ) : null}

            <div className="kg-recat__separator" />

            <div className="kg-recat__section-label">
              {t('knowledge_graph.all_categories', 'All categories')}
            </div>
          </>
        )}

        {/* Category List */}
        <div className="kg-recat__list" role="list">
          {filteredCategories.map((cat) => (
            <button
              key={cat.category}
              className={`kg-recat__category ${cat.category === currentCategory ? 'kg-recat__category--current' : ''}`}
              onClick={() => handleSelect(cat.category)}
              disabled={cat.category === currentCategory}
              type="button"
              role="listitem"
            >
              <span
                className="kg-recat__category-dot"
                style={{ backgroundColor: cat.color }}
              />
              <span className="kg-recat__category-name">{cat.category}</span>
              <span className="kg-recat__category-count">{cat.count}</span>
            </button>
          ))}

          {showCreateNew && (
            <button
              className="kg-recat__create"
              onClick={handleCreate}
              type="button"
            >
              <span className="kg-recat__create-icon">+</span>
              <span className="kg-recat__create-label">
                {t('knowledge_graph.create_category', 'Create "{{name}}"', { name: searchValue.trim() })}
              </span>
            </button>
          )}

          {filteredCategories.length === 0 && !showCreateNew && (
            <div className="kg-recat__empty">
              {t('knowledge_graph.no_categories', 'No matching categories')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

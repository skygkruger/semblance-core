// Knowledge Graph Drill-Down List — Shows knowledge items within a category.
// Rendered inside the detail panel when a category node is selected.
// Features: debounced search, pagination, item click → modal.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WireframeSpinner } from '../WireframeSpinner';
import './drill-down-list.css';
import type { DrillDownItem, DrillDownListProps } from './DrillDownList.types';

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
  category,
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

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSearch(val);
    }, 300);
  }, [onSearch]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="kg-drilldown">
      <div className="kg-drilldown__header">
        <span
          className="kg-drilldown__category-dot"
          style={{ backgroundColor: categoryColor }}
        />
        <span className="kg-drilldown__category-label">{categoryLabel}</span>
        <span className="kg-drilldown__count">{total}</span>
      </div>

      <div className="kg-drilldown__search-wrapper">
        <input
          type="text"
          className="kg-drilldown__search"
          placeholder={t('knowledge_graph.search_items', 'Search items...')}
          value={searchValue}
          onChange={handleSearchChange}
          aria-label={t('knowledge_graph.search_items', 'Search items...')}
        />
      </div>

      <div className="kg-drilldown__list" role="list">
        {items.map(item => (
          <button
            key={item.chunkId}
            className="kg-drilldown__item"
            onClick={() => onItemClick(item)}
            role="listitem"
            type="button"
          >
            <div className="kg-drilldown__item-header">
              <span className="kg-drilldown__item-icon">{getSourceIcon(item.source)}</span>
              <span className="kg-drilldown__item-title">{item.title}</span>
            </div>
            <div className="kg-drilldown__item-preview">{item.preview}</div>
            <div className="kg-drilldown__item-meta">
              <span>{formatDate(item.indexedAt)}</span>
              {item.mimeType && <span>{item.mimeType}</span>}
            </div>
          </button>
        ))}

        {loading && (
          <div className="kg-drilldown__loading">
            <WireframeSpinner size={100} />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="kg-drilldown__empty">
            {searchValue
              ? t('knowledge_graph.no_search_results', 'No items match your search')
              : t('knowledge_graph.no_items', 'No items in this category')}
          </div>
        )}

        {hasMore && !loading && (
          <button
            className="kg-drilldown__load-more"
            onClick={onLoadMore}
            type="button"
          >
            {t('knowledge_graph.load_more', 'Load more')}
          </button>
        )}
      </div>
    </div>
  );
}

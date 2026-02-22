// Search Adapter — Semantic search via VectorStore through PlatformAdapter.
//
// Connects mobile search UI to Core's knowledge graph and vector store.
// Falls back to keyword search if vector store is unavailable on mobile.
//
// CRITICAL: No network calls. Search is fully local.

export interface SearchResult {
  id: string;
  type: 'email' | 'document' | 'reminder' | 'capture' | 'calendar';
  title: string;
  snippet: string;
  score: number;
  timestamp: string;
  source: string;
}

export interface SearchQuery {
  text: string;
  filters?: {
    types?: SearchResult['type'][];
    dateRange?: { start: string; end: string };
    limit?: number;
  };
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalCount: number;
  durationMs: number;
  searchMethod: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * Format search results for display.
 * Highlights matching terms and truncates snippets.
 */
export function formatSearchResults(
  results: SearchResult[],
  maxSnippetLength: number = 150,
): SearchResult[] {
  return results.map(r => ({
    ...r,
    snippet: r.snippet.length > maxSnippetLength
      ? r.snippet.slice(0, maxSnippetLength - 3) + '...'
      : r.snippet,
  }));
}

/**
 * Filter results by type.
 */
export function filterByType(
  results: SearchResult[],
  types: SearchResult['type'][],
): SearchResult[] {
  return results.filter(r => types.includes(r.type));
}

/**
 * Filter results by date range.
 */
export function filterByDateRange(
  results: SearchResult[],
  start: string,
  end: string,
): SearchResult[] {
  const startDate = new Date(start).getTime();
  const endDate = new Date(end).getTime();
  return results.filter(r => {
    const ts = new Date(r.timestamp).getTime();
    return ts >= startDate && ts <= endDate;
  });
}

/**
 * Sort results by relevance score (descending).
 */
export function sortByRelevance(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => b.score - a.score);
}

/**
 * Sort results by recency (most recent first).
 */
export function sortByRecency(results: SearchResult[]): SearchResult[] {
  return [...results].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/**
 * Keyword-based fallback search when vector store is unavailable.
 * Performs case-insensitive substring matching.
 */
export function keywordSearch(
  items: Array<{ id: string; type: SearchResult['type']; title: string; content: string; timestamp: string; source: string }>,
  query: string,
): SearchResult[] {
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length > 2);

  return items
    .map(item => {
      const titleLower = item.title.toLowerCase();
      const contentLower = item.content.toLowerCase();
      let score = 0;

      for (const word of words) {
        if (titleLower.includes(word)) score += 2;
        if (contentLower.includes(word)) score += 1;
      }

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        snippet: item.content.slice(0, 150),
        score,
        timestamp: item.timestamp,
        source: item.source,
      };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Group search results by type for sectioned display.
 */
export function groupByType(
  results: SearchResult[],
): Record<SearchResult['type'], SearchResult[]> {
  const groups: Record<string, SearchResult[]> = {
    email: [],
    document: [],
    reminder: [],
    capture: [],
    calendar: [],
  };

  for (const result of results) {
    groups[result.type]?.push(result);
  }

  return groups as Record<SearchResult['type'], SearchResult[]>;
}

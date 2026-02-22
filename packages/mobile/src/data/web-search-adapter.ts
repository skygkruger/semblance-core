// Web Search Adapter — Mobile adapter for web search and web fetch features.
// Transforms Core's web search results into mobile chat display format.
// Network Monitor shows all searches (they go through Gateway).

export interface MobileSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface MobileSearchResponse {
  query: string;
  results: MobileSearchResult[];
  provider: string;
  timestamp: string;
}

export interface MobileFetchSummary {
  url: string;
  title: string;
  summary: string;
  wordCount: number;
  fetchedAt: string;
}

/**
 * Convert Core's web search results to mobile format.
 */
export function toMobileSearchResults(
  query: string,
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>,
  provider: string
): MobileSearchResponse {
  return {
    query,
    results: results.map((r, i) => ({
      id: `search-${i}`,
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      source: extractDomain(r.url),
    })),
    provider,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert Core's web fetch result to mobile summary format.
 */
export function toMobileFetchSummary(
  url: string,
  result: {
    title?: string;
    summary: string;
    wordCount?: number;
  }
): MobileFetchSummary {
  return {
    url,
    title: result.title ?? extractDomain(url),
    summary: result.summary,
    wordCount: result.wordCount ?? estimateWordCount(result.summary),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Format search results as a chat message for mobile chat display.
 */
export function formatSearchAsChat(response: MobileSearchResponse): string {
  if (response.results.length === 0) {
    return `No results found for "${response.query}".`;
  }

  const lines = response.results.slice(0, 5).map((r, i) =>
    `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.source}`
  );

  return `Search results for "${response.query}":\n\n${lines.join('\n\n')}`;
}

function extractDomain(url: string): string {
  try {
    const match = url.match(/^https?:\/\/([^/]+)/);
    return match?.[1] ?? url;
  } catch {
    return url;
  }
}

function estimateWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

// Web Search Result — Displays search results in the chat interface.
// Each result shows title (as link), snippet text, source domain.

import { Card } from '@semblance/ui';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  age?: string;
}

interface WebSearchResultProps {
  results: SearchResultItem[];
  query: string;
  provider: 'brave' | 'searxng';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function WebSearchResult({ results, query, provider }: WebSearchResultProps) {
  const providerLabel = provider === 'brave' ? 'Brave' : 'SearXNG';

  return (
    <Card className="p-4" data-testid="web-search-result">
      {/* Attribution line */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          Searched via {providerLabel}
        </span>
        <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
        </span>
      </div>

      {/* Results list */}
      <div className="space-y-3">
        {results.map((result, i) => (
          <div key={i} className="group">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-semblance-primary hover:underline"
              data-testid="search-result-link"
            >
              {result.title}
            </a>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">
                {extractDomain(result.url)}
              </span>
              {result.age && (
                <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">
                  {result.age}
                </span>
              )}
            </div>
            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-1 line-clamp-2">
              {result.snippet}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

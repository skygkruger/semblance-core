// Web Search Result — Displays search results in the chat interface.

import { Card } from '@semblance/ui';
import './WebSearchResult.css';

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
    <Card data-testid="web-search-result">
      <div className="web-search__attribution">
        <span className="web-search__provider">Searched via {providerLabel}</span>
        <span className="web-search__count">
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
        </span>
      </div>

      <div className="web-search__results">
        {results.map((result, i) => (
          <div key={i}>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="web-search__result-title"
              data-testid="search-result-link"
            >
              {result.title}
            </a>
            <div className="web-search__result-meta">
              <span className="web-search__domain">{extractDomain(result.url)}</span>
              {result.age && (
                <span className="web-search__age">{result.age}</span>
              )}
            </div>
            <p className="web-search__snippet">{result.snippet}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

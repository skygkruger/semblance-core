// Web Fetch Summary — Displays fetched URL content summary in chat.
// Shows page title, source URL, and byte count attribution.

import { Card } from '@semblance/ui';

interface WebFetchSummaryProps {
  url: string;
  title: string;
  content: string;
  bytesFetched: number;
  contentType: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WebFetchSummary({ url, title, content, bytesFetched, contentType }: WebFetchSummaryProps) {
  const domain = extractDomain(url);
  const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

  return (
    <Card className="p-4" data-testid="web-fetch-summary">
      {/* Attribution line */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          Read from {domain}
        </span>
        <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">
          {formatBytes(bytesFetched)}
        </span>
      </div>

      {/* Page title */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-semblance-primary hover:underline block"
        data-testid="fetch-url-link"
      >
        {title || domain}
      </a>

      {/* Content preview */}
      <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mt-2 leading-relaxed">
        {preview}
      </p>
    </Card>
  );
}

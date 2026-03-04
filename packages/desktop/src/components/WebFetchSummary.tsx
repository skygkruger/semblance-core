// Web Fetch Summary — Displays fetched URL content summary in chat.

import { Card } from '@semblance/ui';
import './WebFetchSummary.css';

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

export function WebFetchSummary({ url, title, content, bytesFetched }: WebFetchSummaryProps) {
  const domain = extractDomain(url);
  const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

  return (
    <Card data-testid="web-fetch-summary">
      <div className="web-fetch__attribution">
        <span className="web-fetch__domain">Read from {domain}</span>
        <span className="web-fetch__size">{formatBytes(bytesFetched)}</span>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="web-fetch__title"
        data-testid="fetch-url-link"
      >
        {title || domain}
      </a>

      <p className="web-fetch__preview">{preview}</p>
    </Card>
  );
}

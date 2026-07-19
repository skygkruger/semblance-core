import { extractVaultSourceCitations } from '@semblance/core/agent/context/citation-validator';

export interface VaultCitationChipsProps {
  content: string;
  citationSourceIds?: string[];
  onSourceClick?: (sourceId: string) => void;
}

function uniqueCitations(content: string, citationSourceIds?: string[]): string[] {
  const fromContent = extractVaultSourceCitations(content);
  const merged = citationSourceIds?.length
    ? [...fromContent, ...citationSourceIds]
    : fromContent;
  return [...new Set(merged)];
}

function formatSourceLabel(sourceId: string): string {
  if (sourceId.startsWith('file:')) {
    return `File ${sourceId.slice(5, 13)}…`;
  }
  if (sourceId.length > 24) {
    return `${sourceId.slice(0, 22)}…`;
  }
  return sourceId;
}

export function VaultCitationChips({
  content,
  citationSourceIds,
  onSourceClick,
}: VaultCitationChipsProps) {
  const citations = uniqueCitations(content, citationSourceIds);
  if (citations.length === 0) {
    return null;
  }

  return (
    <div
      role="list"
      aria-label="Vault source citations"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
        maxWidth: '80%',
      }}
    >
      {citations.map((sourceId) => (
        <button
          key={sourceId}
          type="button"
          role="listitem"
          aria-label={`Vault source ${sourceId}`}
          onClick={() => onSourceClick?.(sourceId)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid rgba(110, 207, 163, 0.35)',
            background: '#111518',
            color: '#6ECFA3',
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            letterSpacing: '0.04em',
            cursor: onSourceClick ? 'pointer' : 'default',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {formatSourceLabel(sourceId)}
        </button>
      ))}
    </div>
  );
}

export function stripVaultCitationMarkers(content: string): string {
  return content.replace(/\[\[source:[^\]]+\]\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

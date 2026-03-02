import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ArtifactPanelProps, ArtifactItem } from './ArtifactPanel.types';
import './ArtifactPanel.css';

function ArtifactContent({ artifact }: { artifact: ArtifactItem }) {
  switch (artifact.type) {
    case 'code':
      return (
        <pre className="artifact-panel__code" data-language={artifact.language}>
          <code>{artifact.content}</code>
        </pre>
      );
    case 'markdown':
    case 'text':
      return (
        <div className="artifact-panel__text">
          <pre>{artifact.content}</pre>
        </div>
      );
    case 'csv':
      return (
        <div className="artifact-panel__table-wrap">
          <pre className="artifact-panel__csv">{artifact.content}</pre>
        </div>
      );
    case 'json':
      return (
        <pre className="artifact-panel__code" data-language="json">
          <code>{artifact.content}</code>
        </pre>
      );
    case 'html':
      return (
        <div className="artifact-panel__text">
          <pre>{artifact.content}</pre>
        </div>
      );
    default:
      return <pre className="artifact-panel__text">{artifact.content}</pre>;
  }
}

export function ArtifactPanel({
  artifact,
  open,
  onClose,
  onDownload,
}: ArtifactPanelProps) {
  const { t } = useTranslation('agent');

  const handleCopy = useCallback(() => {
    if (!artifact) return;
    navigator.clipboard.writeText(artifact.content).catch(() => {
      // Fallback: do nothing — clipboard API not available in some contexts
    });
  }, [artifact]);

  const handleDownload = useCallback(() => {
    if (!artifact || !onDownload) return;
    onDownload(artifact);
  }, [artifact, onDownload]);

  if (!open || !artifact) return null;

  return (
    <aside className="artifact-panel" data-testid="artifact-panel">
      <div className="artifact-panel__header">
        <div className="artifact-panel__header-info">
          <span className="artifact-panel__type-badge">{artifact.type}</span>
          <h3 className="artifact-panel__title">{artifact.title}</h3>
        </div>
        <div className="artifact-panel__header-actions">
          <button
            type="button"
            className="artifact-panel__action"
            onClick={handleCopy}
            aria-label={t('artifact_panel.copy')}
            title={t('artifact_panel.copy')}
            data-testid="artifact-copy"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          {onDownload && (
            <button
              type="button"
              className="artifact-panel__action"
              onClick={handleDownload}
              aria-label={t('artifact_panel.download')}
              title={t('artifact_panel.download')}
              data-testid="artifact-download"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="artifact-panel__close"
            onClick={onClose}
            aria-label={t('artifact_panel.close')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="artifact-panel__body">
        <ArtifactContent artifact={artifact} />
      </div>
    </aside>
  );
}

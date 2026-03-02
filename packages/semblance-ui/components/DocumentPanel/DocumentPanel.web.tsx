import { useTranslation } from 'react-i18next';
import type { DocumentPanelProps, DocumentPanelFile } from './DocumentPanel.types';
import { formatFileSize } from '@semblance/core/agent/attachments';
import './DocumentPanel.css';

function FileRow({
  file,
  onRemove,
  onAddToKnowledge,
  t,
}: {
  file: DocumentPanelFile;
  onRemove: () => void;
  onAddToKnowledge: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className={[
        'doc-panel__file',
        file.status === 'error' ? 'doc-panel__file--error' : '',
      ].filter(Boolean).join(' ')}
      data-testid={`doc-panel-file-${file.id}`}
    >
      <div className="doc-panel__file-info">
        <span className="doc-panel__file-name" title={file.fileName}>
          {file.fileName}
        </span>
        <span className="doc-panel__file-meta">
          {file.status === 'processing'
            ? t('document_panel.processing')
            : file.status === 'error'
              ? file.error ?? t('document_panel.error')
              : formatFileSize(file.sizeBytes)
          }
        </span>
      </div>
      <div className="doc-panel__file-actions">
        {file.status === 'ready' && !file.addedToKnowledge && (
          <button
            type="button"
            className="doc-panel__action doc-panel__action--knowledge"
            onClick={onAddToKnowledge}
            aria-label={t('document_panel.add_to_knowledge')}
            title={t('document_panel.add_to_knowledge')}
            data-testid={`add-to-knowledge-${file.id}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </button>
        )}
        {file.addedToKnowledge && (
          <span className="doc-panel__knowledge-badge" title={t('document_panel.in_knowledge')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        )}
        <button
          type="button"
          className="doc-panel__action doc-panel__action--remove"
          onClick={onRemove}
          aria-label={t('document_panel.remove_file')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function DocumentPanel({
  files,
  open,
  onClose,
  onRemoveFile,
  onAddToKnowledge,
  onAttach,
}: DocumentPanelProps) {
  const { t } = useTranslation('agent');

  if (!open) return null;

  return (
    <aside className="doc-panel" data-testid="document-panel">
      <div className="doc-panel__header">
        <h3 className="doc-panel__title">{t('document_panel.title')}</h3>
        <button
          type="button"
          className="doc-panel__close"
          onClick={onClose}
          aria-label={t('document_panel.close')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className="doc-panel__body">
        {files.length === 0 ? (
          <div className="doc-panel__empty" data-testid="doc-panel-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="doc-panel__empty-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="doc-panel__empty-text">{t('document_panel.empty')}</p>
            <button
              type="button"
              className="doc-panel__attach-btn"
              onClick={onAttach}
              data-testid="doc-panel-attach"
            >
              {t('document_panel.attach_files')}
            </button>
          </div>
        ) : (
          <>
            <div className="doc-panel__file-list">
              {files.map(file => (
                <FileRow
                  key={file.id}
                  file={file}
                  onRemove={() => onRemoveFile(file.id)}
                  onAddToKnowledge={() => onAddToKnowledge(file.id)}
                  t={t}
                />
              ))}
            </div>
            <button
              type="button"
              className="doc-panel__attach-btn doc-panel__attach-btn--bottom"
              onClick={onAttach}
              data-testid="doc-panel-attach"
            >
              {t('document_panel.attach_more')}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

// Knowledge Item Modal — Web implementation.
// Full item detail with 5 curation actions.
// Delete has inline confirmation step — never auto-confirm destructive disk ops.

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnowledgeItemModalProps } from './KnowledgeItemModal.types';
import './knowledge-item-modal.css';

function getSourceLabel(source: string): string {
  switch (source) {
    case 'local_file': return 'Local File';
    case 'email': return 'Email';
    case 'calendar': return 'Calendar';
    case 'browser_history': return 'Browser';
    case 'financial': return 'Financial';
    case 'health': return 'Health';
    case 'contact': return 'Contact';
    case 'note': return 'Note';
    case 'conversation': return 'Conversation';
    default: return 'Document';
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function KnowledgeItemModal({
  item,
  onClose,
  onRemove,
  onDelete,
  onRecategorize,
  onReindex,
  onOpenInChat,
  reindexing,
}: KnowledgeItemModalProps) {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Reset confirmation state when item changes
  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [item?.chunkId]);

  // Close on Escape
  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose, showDeleteConfirm]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleRemove = useCallback(() => {
    if (!item) return;
    onRemove(item.chunkId);
  }, [item, onRemove]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!item) return;
    onDelete(item.chunkId);
    setShowDeleteConfirm(false);
  }, [item, onDelete]);

  const handleRecategorize = useCallback(() => {
    if (!item) return;
    onRecategorize(item.chunkId);
  }, [item, onRecategorize]);

  const handleReindex = useCallback(() => {
    if (!item) return;
    onReindex(item.chunkId);
  }, [item, onReindex]);

  const handleOpenInChat = useCallback(() => {
    if (!item) return;
    onOpenInChat(item.chunkId);
  }, [item, onOpenInChat]);

  if (!item) return null;

  return (
    <div className="kg-modal-backdrop" onClick={handleBackdropClick} role="dialog" aria-modal="true">
      <div className="kg-modal">
        <div className="kg-modal__header">
          <div>
            <div className="kg-modal__source-badge">
              <span className="kg-modal__source-icon">{getSourceIcon(item.source)}</span>
              {getSourceLabel(item.source)}
            </div>
            <h3 className="kg-modal__title">{item.title}</h3>
          </div>
          <button
            className="kg-modal__close"
            onClick={onClose}
            aria-label={t('a11y.close_panel')}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="kg-modal__body">
          <div className="kg-modal__meta">
            <span>{formatDate(item.indexedAt)}</span>
            {item.mimeType && <span>{item.mimeType}</span>}
          </div>

          <div className="kg-modal__category-badge">
            <span className="kg-modal__category-dot" />
            {item.category}
          </div>

          <div className="kg-modal__separator" />

          <p className="kg-modal__preview">{item.preview}</p>

          <div className="kg-modal__separator" />

          {/* Actions */}
          <div className="kg-modal__actions">
            <button
              className="kg-modal__action kg-modal__action--chat"
              onClick={handleOpenInChat}
              type="button"
            >
              <span className="kg-modal__action-icon">[&gt;]</span>
              <span className="kg-modal__action-label">
                {t('knowledge_graph.open_in_chat', 'Open in chat')}
              </span>
            </button>

            <button
              className="kg-modal__action kg-modal__action--recategorize"
              onClick={handleRecategorize}
              type="button"
            >
              <span className="kg-modal__action-icon">[~]</span>
              <span className="kg-modal__action-label">
                {t('knowledge_graph.recategorize', 'Recategorize')}
              </span>
            </button>

            <button
              className="kg-modal__action kg-modal__action--reindex"
              onClick={handleReindex}
              disabled={reindexing}
              type="button"
            >
              <span className="kg-modal__action-icon">[R]</span>
              <span className="kg-modal__action-label">
                {t('knowledge_graph.reindex', 'Re-index')}
              </span>
              {reindexing && <span className="kg-modal__reindex-spinner" />}
            </button>

            <button
              className="kg-modal__action kg-modal__action--remove"
              onClick={handleRemove}
              type="button"
            >
              <span className="kg-modal__action-icon">[x]</span>
              <span className="kg-modal__action-label">
                {t('knowledge_graph.remove_from_graph', 'Remove from graph')}
              </span>
            </button>

            {!showDeleteConfirm ? (
              <button
                className="kg-modal__action kg-modal__action--delete"
                onClick={handleDeleteClick}
                type="button"
              >
                <span className="kg-modal__action-icon">[!]</span>
                <span className="kg-modal__action-label">
                  {t('knowledge_graph.delete_from_disk', 'Delete from disk')}
                </span>
              </button>
            ) : (
              <div className="kg-modal__confirm">
                <div className="kg-modal__confirm-text">
                  {t(
                    'knowledge_graph.delete_confirm',
                    'This will permanently delete the source file from your device. This cannot be undone.',
                  )}
                </div>
                <div className="kg-modal__confirm-buttons">
                  <button
                    className="kg-modal__confirm-btn kg-modal__confirm-btn--cancel"
                    onClick={() => setShowDeleteConfirm(false)}
                    type="button"
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    className="kg-modal__confirm-btn kg-modal__confirm-btn--delete"
                    onClick={handleDeleteConfirm}
                    type="button"
                  >
                    {t('knowledge_graph.confirm_delete', 'Delete permanently')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

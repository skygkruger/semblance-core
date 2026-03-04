import { useState, useCallback, useMemo } from 'react';
import type { ConversationHistoryPanelProps, ConversationHistoryItem } from './ConversationHistoryPanel.types';
import './ConversationHistoryPanel.css';

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupByDate(items: ConversationHistoryItem[]): Array<{ label: string; items: ConversationHistoryItem[] }> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const pinned: ConversationHistoryItem[] = [];
  const today: ConversationHistoryItem[] = [];
  const yesterday: ConversationHistoryItem[] = [];
  const thisWeek: ConversationHistoryItem[] = [];
  const earlier: ConversationHistoryItem[] = [];

  for (const item of items) {
    if (item.pinned) {
      pinned.push(item);
      continue;
    }
    const d = new Date(item.updatedAt);
    if (d >= todayStart) today.push(item);
    else if (d >= yesterdayStart) yesterday.push(item);
    else if (d >= weekStart) thisWeek.push(item);
    else earlier.push(item);
  }

  const groups: Array<{ label: string; items: ConversationHistoryItem[] }> = [];
  if (pinned.length > 0) groups.push({ label: 'Pinned', items: pinned });
  if (today.length > 0) groups.push({ label: 'Today', items: today });
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', items: yesterday });
  if (thisWeek.length > 0) groups.push({ label: 'This Week', items: thisWeek });
  if (earlier.length > 0) groups.push({ label: 'Earlier', items: earlier });
  return groups;
}

function ConversationRow({
  item,
  isActive,
  onSelect,
  onPin,
  onUnpin,
  onRename,
  onDelete,
}: {
  item: ConversationHistoryItem;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const displayTitle = item.title ?? item.autoTitle ?? 'New conversation';

  const handleRenameStart = useCallback(() => {
    setRenameValue(displayTitle);
    setIsRenaming(true);
  }, [displayTitle]);

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim()) {
      onRename(renameValue.trim());
    }
    setIsRenaming(false);
  }, [renameValue, onRename]);

  if (confirmDelete) {
    return (
      <div className="conv-row" data-testid={`conv-row-${item.id}`}>
        <div className="conv-row__confirm">
          <span>{'Delete?'}</span>
          <button
            type="button"
            className="conv-row__confirm-btn conv-row__confirm-yes"
            onClick={() => { onDelete(); setConfirmDelete(false); }}
            data-testid={`conv-confirm-delete-${item.id}`}
          >
            Yes
          </button>
          <button
            type="button"
            className="conv-row__confirm-btn conv-row__confirm-no"
            onClick={() => setConfirmDelete(false)}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`conv-row ${isActive ? 'conv-row--active' : ''}`}
      onClick={onSelect}
      data-testid={`conv-row-${item.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
    >
      <div className="conv-row__content">
        {isRenaming ? (
          <input
            className="conv-panel__search-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setIsRenaming(false); }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            data-testid={`conv-rename-input-${item.id}`}
          />
        ) : (
          <>
            <p className="conv-row__title">
              {item.pinned && <span className="conv-row__pin" data-testid={`conv-pin-badge-${item.id}`}>*</span>}
              {displayTitle}
            </p>
            {item.lastMessagePreview && (
              <p className="conv-row__preview">{item.lastMessagePreview}</p>
            )}
          </>
        )}
      </div>
      <span className="conv-row__time">{formatTimeAgo(item.updatedAt)}</span>

      {!isRenaming && (
        <div className="conv-row__actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="conv-row__action conv-row__action--pin"
            onClick={item.pinned ? onUnpin : onPin}
            title={item.pinned ? 'Unpin' : 'Pin'}
            data-testid={`conv-${item.pinned ? 'unpin' : 'pin'}-${item.id}`}
          >
            {item.pinned ? 'u' : 'p'}
          </button>
          <button
            type="button"
            className="conv-row__action"
            onClick={handleRenameStart}
            title="Rename"
            data-testid={`conv-rename-${item.id}`}
          >
            r
          </button>
          <button
            type="button"
            className="conv-row__action conv-row__action--delete"
            onClick={() => setConfirmDelete(true)}
            title="Delete"
            data-testid={`conv-delete-${item.id}`}
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}

export function ConversationHistoryPanel({
  items,
  activeId,
  open,
  searchQuery,
  onSearchChange,
  onSelect,
  onNew,
  onPin,
  onUnpin,
  onRename,
  onDelete,
  onClose,
}: ConversationHistoryPanelProps) {
  const groups = useMemo(() => groupByDate(items), [items]);

  if (!open) return null;

  return (
    <aside className="conv-panel opal-surface" data-testid="conversation-history-panel">
      <div className="conv-panel__header">
        <h3 className="conv-panel__title">{'History'}</h3>
        <div className="conv-panel__header-actions">
          <button
            type="button"
            className="conv-panel__btn conv-panel__btn--new"
            onClick={onNew}
            title="New conversation"
            data-testid="conv-new-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            className="conv-panel__btn"
            onClick={onClose}
            title="Close"
            data-testid="conv-close-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="conv-panel__search">
        <input
          className="conv-panel__search-input"
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          data-testid="conv-search-input"
        />
      </div>

      <div className="conv-panel__body">
        {items.length === 0 ? (
          <div className="conv-panel__empty" data-testid="conv-panel-empty">
            <p className="conv-panel__empty-text">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="conv-panel__section-label">{group.label}</p>
              {group.items.map((item) => (
                <ConversationRow
                  key={item.id}
                  item={item}
                  isActive={item.id === activeId}
                  onSelect={() => onSelect(item.id)}
                  onPin={() => onPin(item.id)}
                  onUnpin={() => onUnpin(item.id)}
                  onRename={(title) => onRename(item.id, title)}
                  onDelete={() => onDelete(item.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

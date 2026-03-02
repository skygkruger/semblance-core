// Conversation History Panel — UI component tests (web).
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationHistoryPanel } from '../../packages/semblance-ui/components/ConversationHistoryPanel/ConversationHistoryPanel.web.js';
import type { ConversationHistoryItem, ConversationHistoryPanelProps } from '../../packages/semblance-ui/components/ConversationHistoryPanel/ConversationHistoryPanel.types.js';

function makeItem(overrides: Partial<ConversationHistoryItem> = {}): ConversationHistoryItem {
  return {
    id: 'conv-1',
    title: null,
    autoTitle: 'Test conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: false,
    turnCount: 3,
    lastMessagePreview: 'Hello there',
    ...overrides,
  };
}

function makeProps(overrides: Partial<ConversationHistoryPanelProps> = {}): ConversationHistoryPanelProps {
  return {
    items: [],
    activeId: null,
    open: true,
    searchQuery: '',
    onSearchChange: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onPin: vi.fn(),
    onUnpin: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

describe('ConversationHistoryPanel — rendering', () => {
  it('renders when open is true', () => {
    render(<ConversationHistoryPanel {...makeProps({ open: true })} />);
    expect(screen.getByTestId('conversation-history-panel')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(<ConversationHistoryPanel {...makeProps({ open: false })} />);
    expect(screen.queryByTestId('conversation-history-panel')).toBeNull();
  });

  it('shows "No conversations yet" when items is empty', () => {
    render(<ConversationHistoryPanel {...makeProps({ items: [] })} />);
    expect(screen.getByTestId('conv-panel-empty')).toBeInTheDocument();
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('shows "No matching conversations" when search has no results', () => {
    render(<ConversationHistoryPanel {...makeProps({ items: [], searchQuery: 'xyz' })} />);
    expect(screen.getByText('No matching conversations')).toBeInTheDocument();
  });

  it('renders conversation rows', () => {
    const items = [makeItem({ id: 'conv-1' }), makeItem({ id: 'conv-2', autoTitle: 'Second' })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByTestId('conv-row-conv-1')).toBeInTheDocument();
    expect(screen.getByTestId('conv-row-conv-2')).toBeInTheDocument();
  });

  it('shows title when set, falls back to autoTitle', () => {
    const items = [
      makeItem({ id: 'conv-1', title: 'Custom Title', autoTitle: 'Auto Title' }),
      makeItem({ id: 'conv-2', title: null, autoTitle: 'Auto Only' }),
    ];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Auto Only')).toBeInTheDocument();
  });

  it('shows "New conversation" for items with no title and no autoTitle', () => {
    const items = [makeItem({ id: 'conv-1', title: null, autoTitle: null })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByText('New conversation')).toBeInTheDocument();
  });

  it('shows preview text', () => {
    const items = [makeItem({ lastMessagePreview: 'This is a preview' })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByText('This is a preview')).toBeInTheDocument();
  });

  it('marks active conversation with active class', () => {
    const items = [makeItem({ id: 'conv-active' })];
    render(<ConversationHistoryPanel {...makeProps({ items, activeId: 'conv-active' })} />);
    const row = screen.getByTestId('conv-row-conv-active');
    expect(row.className).toContain('conv-row--active');
  });

  it('shows pin badge for pinned conversations', () => {
    const items = [makeItem({ id: 'conv-pinned', pinned: true })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByTestId('conv-pin-badge-conv-pinned')).toBeInTheDocument();
  });
});

// ─── Search ─────────────────────────────────────────────────────────────────

describe('ConversationHistoryPanel — search', () => {
  it('renders search input', () => {
    render(<ConversationHistoryPanel {...makeProps()} />);
    expect(screen.getByTestId('conv-search-input')).toBeInTheDocument();
  });

  it('calls onSearchChange when typing', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(<ConversationHistoryPanel {...makeProps({ onSearchChange })} />);

    const input = screen.getByTestId('conv-search-input');
    await user.type(input, 'port');
    expect(onSearchChange).toHaveBeenCalled();
  });

  it('displays current search query', () => {
    render(<ConversationHistoryPanel {...makeProps({ searchQuery: 'portland' })} />);
    const input = screen.getByTestId('conv-search-input') as HTMLInputElement;
    expect(input.value).toBe('portland');
  });
});

// ─── Interactions ───────────────────────────────────────────────────────────

describe('ConversationHistoryPanel — interactions', () => {
  it('calls onSelect when clicking a row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const items = [makeItem({ id: 'conv-1' })];
    render(<ConversationHistoryPanel {...makeProps({ items, onSelect })} />);

    await user.click(screen.getByTestId('conv-row-conv-1'));
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('calls onNew when clicking new button', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(<ConversationHistoryPanel {...makeProps({ onNew })} />);

    await user.click(screen.getByTestId('conv-new-btn'));
    expect(onNew).toHaveBeenCalled();
  });

  it('calls onClose when clicking close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ConversationHistoryPanel {...makeProps({ onClose })} />);

    await user.click(screen.getByTestId('conv-close-btn'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onPin when clicking pin button on unpinned item', async () => {
    const user = userEvent.setup();
    const onPin = vi.fn();
    const items = [makeItem({ id: 'conv-1', pinned: false })];
    render(<ConversationHistoryPanel {...makeProps({ items, onPin })} />);

    await user.click(screen.getByTestId('conv-pin-conv-1'));
    expect(onPin).toHaveBeenCalledWith('conv-1');
  });

  it('calls onUnpin when clicking unpin button on pinned item', async () => {
    const user = userEvent.setup();
    const onUnpin = vi.fn();
    const items = [makeItem({ id: 'conv-1', pinned: true })];
    render(<ConversationHistoryPanel {...makeProps({ items, onUnpin })} />);

    await user.click(screen.getByTestId('conv-unpin-conv-1'));
    expect(onUnpin).toHaveBeenCalledWith('conv-1');
  });

  it('shows delete confirmation on delete click', async () => {
    const user = userEvent.setup();
    const items = [makeItem({ id: 'conv-1' })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);

    await user.click(screen.getByTestId('conv-delete-conv-1'));
    expect(screen.getByText('Delete?')).toBeInTheDocument();
  });

  it('calls onDelete on confirmation', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const items = [makeItem({ id: 'conv-1' })];
    render(<ConversationHistoryPanel {...makeProps({ items, onDelete })} />);

    await user.click(screen.getByTestId('conv-delete-conv-1'));
    await user.click(screen.getByTestId('conv-confirm-delete-conv-1'));
    expect(onDelete).toHaveBeenCalledWith('conv-1');
  });

  it('starts rename on rename button click', async () => {
    const user = userEvent.setup();
    const items = [makeItem({ id: 'conv-1', autoTitle: 'Original' })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);

    await user.click(screen.getByTestId('conv-rename-conv-1'));
    expect(screen.getByTestId('conv-rename-input-conv-1')).toBeInTheDocument();
  });
});

// ─── Date Grouping ──────────────────────────────────────────────────────────

describe('ConversationHistoryPanel — date grouping', () => {
  it('groups items into Today section', () => {
    const items = [makeItem({ updatedAt: new Date().toISOString() })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('groups items into Pinned section', () => {
    const items = [makeItem({ pinned: true, updatedAt: new Date().toISOString() })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });

  it('groups old items into Earlier section', () => {
    const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();
    const items = [makeItem({ updatedAt: oldDate })];
    render(<ConversationHistoryPanel {...makeProps({ items })} />);
    expect(screen.getByText('Earlier')).toBeInTheDocument();
  });
});

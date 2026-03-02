export interface ConversationHistoryItem {
  id: string;
  title: string | null;
  autoTitle: string | null;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  turnCount: number;
  lastMessagePreview: string | null;
}

export interface ConversationHistoryPanelProps {
  items: ConversationHistoryItem[];
  activeId: string | null;
  open: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

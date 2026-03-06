// Knowledge Item Modal — Displays full item detail with curation actions.
// Actions: Remove from graph, Delete from disk, Recategorize, Reindex, Open in chat.

import type { DrillDownItem } from './DrillDownList.types';

export interface KnowledgeItemModalProps {
  /** The item to display, or null if modal is closed */
  item: DrillDownItem | null;
  /** Close the modal */
  onClose: () => void;
  /** Remove item from the knowledge graph only (keeps file on disk) */
  onRemove: (chunkId: string) => void;
  /** Delete item from disk permanently (shows inline confirmation) */
  onDelete: (chunkId: string) => void;
  /** Open the recategorize sheet for this item */
  onRecategorize: (chunkId: string) => void;
  /** Re-index this item (re-embed, re-extract metadata) */
  onReindex: (chunkId: string) => void;
  /** Open the item in the chat for conversation */
  onOpenInChat: (chunkId: string) => void;
  /** Whether a reindex operation is currently running */
  reindexing?: boolean;
}

export type ModalAction = 'remove' | 'delete' | 'recategorize' | 'reindex' | 'open-in-chat';

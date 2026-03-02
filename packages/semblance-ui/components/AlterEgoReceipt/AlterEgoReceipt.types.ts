export interface AlterEgoReceiptProps {
  id: string;
  summary: string;
  reasoning: string;
  undoExpiresAt: string | null;
  onUndo: (id: string) => void;
  onDismiss: (id: string) => void;
}

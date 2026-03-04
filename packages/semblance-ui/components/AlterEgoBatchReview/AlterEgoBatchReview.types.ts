export interface BatchItem {
  id: string;
  actionType?: string;
  summary: string;
  reasoning: string;
  category: string;
  createdAt?: string;
}

export interface AlterEgoBatchReviewProps {
  items: BatchItem[];
  onConfirm: (approvedIds: string[], rejectedIds: string[]) => void;
}

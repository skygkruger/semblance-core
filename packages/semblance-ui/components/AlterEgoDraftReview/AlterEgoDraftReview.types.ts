export interface AlterEgoDraftReviewProps {
  actionId: string;
  contactEmail: string;
  subject?: string;
  body: string;
  trustCount: number;
  trustThreshold: number;
  onSend: (actionId: string) => void;
  onEdit: (body: string) => void;
}
